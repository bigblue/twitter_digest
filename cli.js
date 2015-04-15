require('with-env')();
var Twitter = require('twitter');
var _ = require('lodash');

var searchTerms = process.argv.slice(2).join(" ");
 
var client = new Twitter({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET
});
 
client.get('search/tweets', {q: 'lang:en filter:links ' + searchTerms}, function(error, tweets, response){
  var statuses = _.pluck(tweets.statuses, 'text')
  console.log(statuses);
  console.log(tweets.search_metadata)
});
