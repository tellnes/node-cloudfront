var cloudfront = require('..')
  , inspect = require('eyes').inspector({maxLength: -1})

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET)

// argv: distributionId, callerReference, path

cf.createInvalidation(process.argv[2], process.argv[3], process.argv.slice(4), function(err, invalidation) {
  if (err) return inspect(err)

  inspect(invalidation)
})
