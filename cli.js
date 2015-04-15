require('with-env')();
var qs = require('qs');
var moment = require('moment');
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


fetchTweetList(params, [], function(list){
  console.log(list)
  console.log(list.length)
});
