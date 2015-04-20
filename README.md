# Twitter Links to RSS feed generator

This script will monitor a search term on twitter and produce an RSS feed of the unique links, using mongodb to save a copy of each link to prevent duplicates. It is designed to be run as an hourly scheduled task on heroku, and produces and RSS feed that is then stored on amazon S3. As there is no `web` process running it shouldn't incur any costs on heroku.

## Prerequisites

You'll need twitter oauth access keys already setup, a heroku account and Amazon S3 access details.

## Setup

```bash
# Get the script
git clone https://github.com/bigblue/twitter_digest.git
cd twitter_digest

# Setup the environment variables
mv .env.sample .env
#-> Edit .env with your own twitter oauth keys and s3 access details

# Create a new heroku app
heroku create
heroku plugins:install git://github.com/ddollar/heroku-config.git
heroku config:push
heroku addons:add mongolab
heroku addons:add scheduler:standard
git push heroku master

# Test everything is setup correctly
heroku run node cli.js "your twitter search terms"

# Setup the scheduled task
heroku addons:open scheduler
#-> Setup a new hourly job with the command node cli.js "your twitter search terms"
```

## Contributing

1. Create an issue to discuss about your idea
2. [Fork it] (https://github.com/bigblue/twitter_digest/fork)
3. Create your feature branch (`git checkout -b my-new-feature`)
4. Commit your changes (`git commit -am 'Add some feature'`)
5. Push to the branch (`git push origin my-new-feature`)
6. Create a new Pull Request
7. Profit! :white_check_mark:

## License

Released under the MIT License.
