require('with-env')();
var qs = require('qs');
var moment = require('moment');
var request = require('request');
var url = require('url');
var async = require('async');
var Twitter = require('twitter');
var _ = require('lodash');
 
var client = new Twitter({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET
});

function fetchTweetList(params, tweetsSoFar, cb){
  client.get('search/tweets', params, function(error, tweets, response){
    var statuses = _.pluck(_.filter(tweets.statuses, function(s){ return !s.retweeted_status }), 'text')
    var allTweets = tweetsSoFar.concat(statuses)

    var searchFromTime = moment().subtract(1, 'days');
    var lastTweetTime = moment(_.last(tweets.statuses).created_at)

    if(tweets.search_metadata.next_results && (lastTweetTime > searchFromTime)){
      var nextPageParams = qs.parse(tweets.search_metadata.next_results.replace(/^\?/, ""))
      console.log(nextPageParams)
      fetchTweetList(nextPageParams, allTweets, cb)
    } else {
      cb(allTweets)
    }
  });
}

var searchTerms = process.argv.slice(2).join(" ");

var params = {q: 'filter:links ' + searchTerms,
              lang: 'en',
              result_type: 'recent',
              count: 100,
              include_entities: false
}

//fetchTweetList(params, [], function(list){
//  console.log(list)
//  console.log(list.length)
//});

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
                   followAllRedirects: true}, 
                  function (err, res, body) {
    if (!err && res.statusCode == 200) {
      var uri = url.parse(r.uri.href)
      var linkKey = uri.protocol + '//' + uri.host + uri.pathname;
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
  async.map(_.pairs(splitLinkTweets), function(t, cb){
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

var tweets = ['.@Hortonworks buys SequenceIQ, to speed cloud- and #Docker-based #Hadoop deployments #BigDataCo http://t.co/DfxhdViFrh',
  'Docker Attracts Big Fish, Eyes Micro-Service Platform http://t.co/skxA2dSw1C #fundraising',
  'Docker Said to Join $1 Billion Valuation Club With New Funding http://t.co/WexN1B8WG1 #fundraising',
  'Deploying Perl Docker Container to Elastic Beanstalk http://t.co/GgwnO9BxQE #aws #StackOverflow',
  'Docker Raises $95M in Series D #Funding http://t.co/BEnmtucAQ9',
  'Modern DevOps with Docker http://t.co/o1rmWqIQgl #Docker #ITOps',
  '.@andypiper this post on the @xebialabs blog seemed like an interesting perspective on such things http://t.co/zYwZFPGH9w @chanezon',
  'So fun to see almost what the Docker logo turned out to be.  https://t.co/9g2P2EyUKS',
  'Simple TOSCA Orchestration for Docker x @CloudOpting  http://t.co/uonh8n2XVY',
  'Docker Said to Join $1 Billion Valuation Club With New Funding http://t.co/WexN1B8WG1 #fundraising',
  '#Docker for #Node.js and Puppet\'s Chocolatey - #DevOps News Digest http://t.co/necKeDvIH0',
  'Test tweet http://bit.ly/1IhnC7X']


followTweetLinks(splitTweetLinks(tweets), function(results){
  console.log(_.values(results))
})
