var cloudfront = require('..')
  , inspect = require('eyes').inspector({maxLength: -1})

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET)

cf.getInvalidation(process.argv[2], process.argv[3], function(err, dist) {
  if (err) return inspect(err)

  inspect(dist)
})
