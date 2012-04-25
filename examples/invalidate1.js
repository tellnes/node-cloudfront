var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

// argv: distributionId, callerReference, path

cf.createInvalidation(process.argv[2], process.argv[3], process.argv[4], function(err, invalidation) {
  if (err) return console.error(err);

  console.log(invalidation);
});
