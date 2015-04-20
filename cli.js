require('with-env')();
var qs = require('qs');
var moment = require('moment');
var request = require('request');
var url = require('url');
var async = require('async');
var Twitter = require('twitter');
var _ = require('lodash');
var RSS = require('rss');
var knox = require('knox');
var mongoose = require('mongoose');
var mongo_url = process.env.MONGODB_URI ? process.env.MONGODB_URI : process.env.MONGOLAB_URI;
mongoose.connect(mongo_url)

process.setMaxListeners(0);
 
var client = new Twitter({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET
});

var s3 = knox.createClient({
  key: process.env.S3_ACCESS_KEY,
  secret: process.env.S3_SECRET_KEY,
  bucket: process.env.S3_BUCKET,
  region: 'eu-west-1'
});

function fetchTweetList(params, tweetsSoFar, collection, cb){
  console.log("Getting tweets from /search/tweets/json?" + qs.stringify(params))
  client.get('search/tweets', params, function(error, tweets, response){
    if(!tweets.statuses || tweets.statuses.length == 0){
      return cb(tweetsSoFar)
    }

    var statuses = _.pluck(_.filter(tweets.statuses, function(s){ return !s.retweeted_status }), 'text')
    var allTweets = tweetsSoFar.concat(statuses)
    if(!params.max_id){
      collection.update({ feedState: 'since_id' },
                      {
                        feedState: 'since_id',
                        value: tweets.search_metadata.max_id_str
                      },
                      {upsert: true},
                      function(err, doc){  })
    }

    var searchFromTime = moment().subtract(24, 'hours');
    var lastTweetTime = moment(_.last(tweets.statuses).created_at)

    if(tweets.search_metadata.next_results && (lastTweetTime > searchFromTime)){
      var nextPageParams = qs.parse(tweets.search_metadata.next_results.replace(/^\?/, ""))
      fetchTweetList(nextPageParams, allTweets, collection, cb)
    } else {
      cb(allTweets)
    }
  });
}

function getTweetLinks(status){
  var re = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/g; 
  var m;
  var results = {};
 
  do {
    m = re.exec(status);
    if (m) {
      var link = m[0] 
      results[link] = [status]
    }
  } while (m);
  return results;
}


function getPageTitle(body){
  var re = /(<\s*title[^>]*>(.+?)<\s*\/\s*title)>/gi;
  var match = re.exec(body);
  if (match && match[2]) {
    return match[2]
  } else {
    return ""
  }
}

function followLink(link, statuses, cb){
  var r = request({uri: link,
                   followAllRedirects: true,
                   maxRedirects: 8}, 
                  function (err, res, body) {
    if (!err && res.statusCode == 200) {
      var uri = url.parse(r.uri.href)
      var linkKey = uri.protocol + '//' + uri.host + uri.pathname;
      console.log('Link ' + link + ' followed to ' + linkKey)
      var fullLink = uri.protocol + '//' + uri.host + uri.path;
      var title = getPageTitle(body);
      linkData = {}
      linkData[linkKey] = [fullLink, title, statuses]
      cb(null, linkData)
    } else {
      cb(null, {})
    }
  })
}

function splitTweetLinks(tweets){
  var results = _.reduce(tweets, function(results, s){
    return _.merge(results, getTweetLinks(s))
  }, {})
  return results
}

function followTweetLinks(splitLinkTweets, complete){
  console.log(_.keys(splitLinkTweets).length + " links to follow...")
  async.mapLimit(_.pairs(splitLinkTweets), 10, function(t, cb){
    followLink(t[0], t[1], cb)
  }, function(err, results){
   var combined = _.reduce(results, function(acc, link){
     var linkKey = _.first(_.keys(link))
     var linkVals = _.values(link)
     if(acc.hasOwnProperty(linkKey)){
       acc[linkKey][2] = acc[linkKey][2].concat(_.last(_.last(linkVals)))
       return acc
     } else {
       return _.merge(acc, link)
     }
   }, {})
   complete(combined) 
  })
}

function setupDb(collection, cb){
  collection.ensureIndex({linkId: 1}, {unique: true}, cb)
}

function saveLinks(collection, tweetsWithLinks, cb){
  var docs = _.map(_.pairs(tweetsWithLinks), function(t){
    return {linkId: t[0],
            fullLink: t[1][0],
            pageTitle: t[1][1],
            statuses: t[1][2],
            createdAt: moment().toISOString()}
  })

  async.each(docs, function(doc, callback){
    collection.update({ linkId: doc.linkId },
                    {
                      '$setOnInsert': _.omit(doc, 'statuses'),
                      '$addToSet': { statuses: { '$each': doc.statuses }}
                    },
                    {upsert: true},
                    function(err, doc){ 
                      if(err){
                        console.log(err)
                      }
                      callback(err) })
  }, cb)
}

function createRssFeed(collection, searchTerms, cb){
  var feed = new RSS({title: "Twitter links digest for " + searchTerms,
                     description: "Unique links from twitter search for " + searchTerms,
                     feed_url: "",
                     site_url: "http://search.twitter.com"});

  collection.find({}, { sort: [['_id', 'desc']] }).toArray(function(err, docs) {
    docs.forEach(function(doc) {
      feed.item({title: doc.pageTitle,
                 description: doc.statuses,
                 url: doc.fullLink,
                 guid: doc._id,
                 date: doc.createdAt});
    })
    var xml = feed.xml();
    return cb(xml)
  })
}

function saveRssFeed(xml, cb){
  var req = s3.put('/feed.xml', {
    'Content-Length': Buffer.byteLength(xml),
    'Content-Type': 'application/rss+xml',
    'x-amz-acl': 'public-read'
  });

  req.on('response', function(res){
    if (200 == res.statusCode) {
      cb(req.url)
    }
  });

  req.end(xml)
}

var searchTerms = process.argv.slice(2).join(" ");

var params = {q: 'filter:links ' + searchTerms,
              lang: 'en',
              result_type: 'recent',
              count: 100,
              include_entities: false
}


var connection = mongoose.connection;
connection.on('error', console.error.bind(console, 'connection error:'));
connection.once('open', function (callback){
  var db = connection.db;

  var feed = db.collection('feed');
  var links = db.collection('links');

  feed.findOne({feedState: 'since_id'}, function(err, since){
    if (since) {
      params['since_id'] = since.value
    }
    fetchTweetList(params, [], feed, function(list){
      setupDb(links, function(err, doc){
        followTweetLinks(splitTweetLinks(list), function(results){
          console.log(_.keys(results).length + " links to save... ")
          saveLinks(links, results, function(err){
            createRssFeed(links, searchTerms, function(xml){
              saveRssFeed(xml, function(url){
                console.log("RSS created: " + url)
                db.close()
              })
            })
          });
        })
      })
    });
  });
})


