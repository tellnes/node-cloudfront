var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

// argv: distributionId, callerReference, path

cf.getDistribution(process.argv[2], function(err, distribution) {
  if (err) throw err;

  distribution.invalidate(process.argv[2], process.argv[3], function(err, invalidation) {
    if (err) throw err;

    console.log(invalidation);
  });
});
