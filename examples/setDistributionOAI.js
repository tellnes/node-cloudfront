var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistributionConfig(process.argv[2], function(err, config) {
  if (err) throw err;

  config.originAccessIdentity = process.argv[3];

  console.log(config);
  console.log(cf.generateDistributionXml(config));

  cf.setDistributionConfig(process.argv[2], config, function(err, config2) {
    if (err) throw err;

    console.log(config2);
  });
});
