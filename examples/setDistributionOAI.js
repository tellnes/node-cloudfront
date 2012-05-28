var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistributionConfig(process.argv[2], function(err, config) {
  if (err) throw err;

  var id = process.argv[4] || config.defaultCacheBehavior.targetOriginId
    , origin
  for (var i = 0, len = config.origins.length; i < len; i++) {
    if (config.origins[i].id == id) {
      origin = config.origins[i]
      break
    }
  }

  origin.originAccessIdentity = process.argv[3];

  console.log(config);
  console.log(cf.generateDistributionXml(config));

  cf.setDistributionConfig(process.argv[2], config, function(err, config2) {
    if (err) throw err;

    console.log(config2);
  });
});
