var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getOAI(process.argv[2], function(err, oai) {
  if (err) throw err;

  oai.delete(function(err) {
    if (err) {
      console.error(err);
    } else {
      console.log(arguments);
    }
  });
});
