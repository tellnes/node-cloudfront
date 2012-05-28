var util = require('util');
var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistributionConfig(process.argv[2], function(err, config) {
  if (err) throw err;


  config.defaultCacheBehavior.trustedSigners.enabled = true
  ;[].push.apply(config.defaultCacheBehavior.trustedSigners, process.argv.slice(3));



  console.log(util.inspect(config, false, 3, true));
  console.log(cf.generateDistributionXml(config));

  cf.setDistributionConfig(process.argv[2], config, function(err, distribution) {
    if (err) throw err;

    console.log(util.inspect(distribution, false, 3, true));
  });
});
