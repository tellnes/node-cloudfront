var cloudfront = require('..')
  , inspect = require('eyes').inspector({maxLength: -1})

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistributionConfig(process.argv[2], function(err, config, info) {
  if (err) throw err;


  config.defaultCacheBehavior.trustedSigners.enabled = true
  ;[].push.apply(config.defaultCacheBehavior.trustedSigners, process.argv.slice(3));

  inspect(config)
  inspect(cf.generateDistributionXml(config))

  cf.setDistributionConfig(process.argv[2], config, function(err, distribution) {
    if (err) throw err;

    inspect(distribution)
  });
});
