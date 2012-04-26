var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistribution(process.argv[2], function(err, dist) {
  if (err) return console.error(err);

  cf.deleteDistribution(dist.id, dist.etag, function(err) {
    if (err) return console.error(err);

    console.log('Deleted');
  });
});
