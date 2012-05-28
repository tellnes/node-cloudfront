var cloudfront = require('..')
, inspect = require('eyes').inspector({maxLength: -1})

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistributionConfig(process.argv[2], function(err, config, info) {
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


  inspect(config);
  inspect(cf.generateDistributionXml(config));

  cf.setDistributionConfig(process.argv[2], config, function(err, config2) {
    if (err) throw err;

    inspect(config2);
  });
});
