var https = require('https')
  , crypto = require('crypto')
  , data2xml = require('data2xml')
  , xml2js = require('xml2js')
  , querystring = require('querystring')
  , util = require('util')
  , url = require('url')
  ;


function CloudFrontError(name, message, code) {
  Error.call(this);
  Error.captureStackTrace(this);
  this.name = name;
  this.message = message;
  this.code = code;
}
util.inherits(CloudFrontError, Error);


function listOptsToPath(path, opts) {
  var qs = {};

  if (opts.marker) {
    qs.Marker = opts.marker;
  }
  if (opts.maxItems) {
    qs.MaxItems = opts.maxItems;
  }

  if (opts.streaming) {
    path = 'streaming-' + path;
  }

  qs = querystring.stringify(qs);

  return path + (qs ? '?' + qs : '');
}

function listBodyToInfo(that, opts, DataConstr, body) {

  var info = {};
  info.isTruncated = body.IsTruncated == 'true';
  info.marker = body.Maker;
  info.nextMarker = body.NextMarker;
  info.maxItems = body.MaxItems;

  var listKey = DataConstr.name + 'Summary';
  if (opts.streaming) {
    listKey = 'Streaming' + listKey;
  }

  var list = body[listKey];
  if (!list) {
    list = [];
  } else if (!Array.isArray(list)) {
    list = [list];
  }

  info.list = list.map(function(data) {
    return new DataConstr(that, opts, data);
  });

  return info;
}

function toUnixTime(time) {
  if (Number(time) == time) {
    time = Number(time);
  }

  if (typeof time === 'string') {
    time = new Date(time);
  }

  if (time instanceof Date) {
    time = time.getTime()/1000;
  }

  if (time <= 86400) {
    time = (Date.now()/1000) + time;
  }

  time = Math.round(time);

  return time;
}

function CloudFront(key, secret) {
  this.key = key;
  this.secret = secret;
}
CloudFront.version = '2012-03-15';
CloudFront.endpoint = 'cloudfront.amazonaws.com';

CloudFront.prototype.request = function(method, path, headers, cb) {
  if (arguments.length === 3) {
    cb = headers;
    headers = {};
  }

  headers.date = new Date().toUTCString();

  var signature = crypto.createHmac('sha1', this.secret)
  .update(headers.date)
  .digest('base64');

  headers.authorization = 'AWS ' + this.key + ':' + signature;

  var req = https.request({
    host: CloudFront.endpoint,
    headers: headers,
    method: method,
    path: '/' + CloudFront.version + '/' + path
  });

  req.on('response', function(res) {
    if (res.statusCode === 204) return cb(null, null, res);

    var parser = new xml2js.Parser();
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      parser.saxParser.write(chunk);
    });

    parser.on('end', function(body) {
      var err = null;
      if (res.statusCode >= 400) {
        if (body && body.Error && body.Error.Code) {
          err = new CloudFrontError(body.Error.Code, body.Error.Message, res.statusCode);
        } else {
          err = new Error('AWS CloudFront Error; status code: ' + res.statusCode);
        }
      }

      cb(err, body, res);
    });
    parser.on("error", function(err) {
      cb(err);
    });

  });

  return req;
};


CloudFront.prototype.generateDistributionXml = function(config) {
  var data = {
    CallerReference: config.callerReference,
    Comment: config.comment || '',
    Enabled: !!config.enabled
  };
  if (config.defaultRootObject) {
    data.DefaultRootObject = config.defaultRootObject;
  }
  if (config.cname) {
    data.CNAME = config.cname;
  }

  if (config.originType == 's3') {
    data.S3Origin = {
      DNSName: config.originDNSName
    };
    if (config.originAccessIdentity) {
      data.S3Origin.OriginAccessIdentity = 'origin-access-identity/cloudfront/' + config.originAccessIdentity;
    }
  } else if (config.originType == 'custom') {
    data.CustomOrigin = {
      DNSName: config.originDNSName,
      HTTPPort: config.originHTTPPort,
      HTTPSPort: config.originHTTPSPort,
      OriginProtocolPolicy: config.originProtocolPolicy
    };
  }
  if (config.logging) {
    data.Logging = {
      Bucket: config.logging.bucket,
      Prefix: config.logging.prefix
    };
  }
  if (config.requiredProtocols) {
    data.RequiredProtocols = {
      Protocol: config.requiredProtocols
    };
  }
  if (config.trustedSigners) {
    var trustedSigners = config.trustedSigners;
    if (!Array.isArray(trustedSigners)) {
      trustedSigners = [trustedSigners];
    }
    data.TrustedSigners = trustedSigners.map(function(signer) {
      if (signer == 'self') {
        return {
          Self: ''
        };
      } else {
        return {
          AwsAccountNumber: signer
        }
      }
    });
  }
  return data2xml('DistributionConfig', data);
};

CloudFront.prototype.createDistribution = function(config, callerReference, cb) {
  if (arguments.length == 3) {
    config.callerReference = callerReference;
  } else {
    cb = callerReference;
  }

  var self = this;
  var req = this.request('POST', (config.streaming ? 'streaming-' : '') + 'distribution', function(err, body) {
    if (err) return cb(err);

    var item = new Distribution(self, {}, body);
    cb(null, item);
  });
  req.write(this.generateDistributionXml(config));
  req.end();
};

CloudFront.prototype.getDistribution = function(distribution, opts, cb) {
  if (arguments.length == 2) {
    cb = opts;
    opts = {};
  }

  var self = this;
  this.request('GET', (opts.streaming ? 'streaming-' : '') + 'distribution/' + distribution, function(err, body) {
    if (err) return cb(err);

    var item = new Distribution(self, {},
    body);
    cb(null, item);
  }).end();
};

CloudFront.prototype.getDistributionConfig = function(distribution, opts, cb) {
  if (arguments.length == 2) {
    cb = opts;
    opts = {};
  }

  var self = this;
  this.request('GET', (opts.streaming ? 'streaming-' : '') + 'distribution/' + distribution + '/config', function(err, body, res) {
    if (err) return cb(err);

    var item = new DistributionConfig(self, {
      distribution: distribution
    }, body);
    item.etag = res.headers.etag;
    cb(null, item);
  }).end();
};

CloudFront.prototype.setDistributionConfig = function(distribution, config, callerReference, cb) {
  if (arguments.length == 4) {
    config.callerReference = callerReference;
  } else {
    cb = callerReference;
  }

  if (!config.etag) {
    throw new Error('Config must include etag');
  }

  var self = this;
  var req = this.request('PUT', (config.streaming ? 'streaming-' : '') + 'distribution/' + distribution + '/config', {
    'If-Match': config.etag
  }, function(err, body, res) {
    if (err) return cb(err);

    var item = new DistributionConfig(self, {
      distribution: distribution
    }, body);
    item.etag = res.headers.etag;
    cb(null, item);
  });
  req.write(this.generateDistributionXml(config));
  req.end();
};

CloudFront.prototype.deleteDistribution = function(distribution, etag, opts, cb) {
  if (arguments.length == 3) {
    cb = opts;
    opts = {};
  }

  if (!etag) {
    throw new Error('Missing etag');
  }
  etag = String(etag.etag || etag);

  this.request('DELETE', (opts.streaming ? 'streaming-' : '') + 'distribution/' + distribution, {'If-Match': etag}, cb).end();
};

CloudFront.prototype.listDistributions = function(opts, cb) {
  if (arguments.length === 1) {
    cb = opts;
    opts = {};
  }

  var self = this;
  this.request('GET', listOptsToPath('distribution', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {
      streaming: opts.streaming,
      isList: true
    }, Distribution, body);
    cb(null, info.list, info);
  }).end();
};

/* Invalidation */

CloudFront.prototype.generateInvalidationXml = function(callerReference, paths) {
  return data2xml('InvalidationBatch', {
    Path: paths,
    CallerReference: callerReference
  });
};

CloudFront.prototype.createInvalidation = function(distribution, callerReference, paths, cb) {
  if (!distribution) {
    throw new TypeError('First argument must be a valid distribution id');
  }

  var self = this;
  var req = this.request('POST', 'distribution/' + distribution + '/invalidation', function(err, body) {
    if (err) return cb(err);

    var item = new Invalidation(self, {
      distribution: distribution
    },
    body);
    cb(null, item);
  });
  req.write(this.generateInvalidationXml(callerReference, paths));
  req.end();
};

CloudFront.prototype.getInvalidation = function(distribution, id, cb) {
  var self = this;
  this.request('GET', 'distribution/' + distribution + '/invalidation/' + id, function(err, body) {
    if (err) return cb(err);

    var item = new Invalidation(self, {
      distribution: distribution
    },
    body);
    cb(null, item);
  }).end();
};

CloudFront.prototype.listInvalidations = function(distribution, opts, cb) {
  if (arguments.length === 2) {
    cb = opts;
    opts = {};
  }

  var self = this;
  this.request('GET', listOptsToPath('distribution/' + distribution + '/invalidation', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {
      distribution: distribution
    },
    Invalidation, body);
    cb(null, info.list, info);
  }).end();
};

CloudFront.prototype.generateOriginAccessIdentityXml = function(callerReference, comment) {
  comment = comment || '';

  // Support passing an config object, eg. an OriginAccessIdentity
  if (comment.comment) {
    comment = comment.comment;
  }

  return data2xml('CloudFrontOriginAccessIdentityConfig', {
    CallerReference: callerReference,
    Comment: comment || ''
  });
};

CloudFront.prototype.createOAI =
CloudFront.prototype.createOriginAccessIdentity = function(callerReference, comment, cb) {
  var self = this;
  var req = this.request('POST', 'origin-access-identity/cloudfront', function(err, body) {
    if (err) return cb(err);

    var item = new CloudFrontOriginAccessIdentity(self, {}, body);
    cb(null, item);
  });
  req.write(this.generateOriginAccessIdentityXml(callerReference, comment));
  req.end();
};

CloudFront.prototype.getOAI =
CloudFront.prototype.getOriginAccessIdentity = function(id, cb) {
  var self = this;
  this.request('GET', 'origin-access-identity/cloudfront/' + id, function(err, body, res) {
    if (err) return cb(err);

    var item = new CloudFrontOriginAccessIdentity(self, {}, body);
    item.etag = res.headers.etag;
    cb(null, item);
  }).end();
};

CloudFront.prototype.listOAIs =
CloudFront.prototype.listOriginAccessIdentities = function(opts, cb) {
  if (arguments.length === 1) {
    cb = opts;
    opts = {};
  }

  // Make sure that the streaming prefix is not added.
  opts.streaming = false;

  var self = this;
  this.request('GET', listOptsToPath('origin-access-identity/cloudfront', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {
      isList: true
    }, CloudFrontOriginAccessIdentity, body);
    cb(null, info.list, info);
  }).end();
};

/**
 * Create signed url for canned policy and return it
 * @param urlString url to append to
 * @param expires when url should expire. In seconds since unix epoch time
 * @param privateKey private key
 * @param keyPairId key pair id
 * @return signed url
 */
CloudFront.prototype.signUrlWithCannedPolicy = function(urlString, expires, privateKey, keyPairId) {
  var policy = JSON.stringify({
    Statement: [{
      Resource: urlString,
      Condition: {
        DateLessThan: {
          "AWS:EpochTime": expires
        }
      }
    }]
  });

  var signer = crypto.createSign('RSA-SHA1');
  signer.update(policy);
  var signature = signer.sign(privateKey, 'base64');

  var query = {
    Expires: expires,
    Signature: signature.replace(/\+/g, '-').replace(/\//g, '~').replace(/=/g, '_'),
    'Key-Pair-Id': keyPairId
  }

  urlString += (~urlString.indexOf('?') ? '&' : '?') + querystring.stringify(query);
  return urlString;
};

/**
  Possible argument combinations:
    1) hostname, path, expires, options

    2) hostname, path, expires
    3) url, expires, options
    4) hostname, path, options

    5) url, options
    6) expires, options
    7) url, expires

    8) options


  Does not support streaming at the moment.
*/

CloudFront.prototype.getPrivateUrl = function(a, b, c, d) {
  var config;

  var config
    , args = arguments
    , le = args.length
    ;

  function parseUrlArg() {
    var obj = url.parse(a);
    config.hostname = obj.hostname;
    config.path = obj.path;
  }

  // args 1 and 2
  if (le === 4 || (le === 3 && typeof c !== 'object')) {
    config = {
      hostname: a,
      path: b,
      expires: c
    };

  } else if (le === 3) { // expect c to be an object
    config = c;

    // args 3
    if (typeof b === 'string') {
      config.hostname = a;
      config.path = b;

    // args 4
    } else {
      parseUrlArg();
      config.expires = b;
    }

  } else if (le === 2) {
    if (typeof b === 'object') {
      config = b;

      // args 5
      if (typeof a === 'string') {
        parseUrlArg();

      // args 6
      } else {
        config.expires = a;
      }

    // args 7
    } else {
      config = {};
      config.expires = b;
      parseUrlArg();
    }
  } else if (le === 1) {
    config = a;
  } else {
    throw new TypeError('Invalid arguments to CloudFront#getPrivateUrl');
  }

  config.expires = toUnixTime(config.expires);

  if (!config.expires) {
    throw new TypeError('Missing expires argument to CloudFront#getPrivateUrl');
  }
  if (!config.hostname) {
    throw new TypeError('Missing hostname argument to CloudFront#getPrivateUrl');
  }
  if (!config.path) {
    throw new TypeError('Missing path argument to CloudFront#getPrivateUrl');
  }

  var resource, policy, signature
    , keyPairId = config.keyPairId || this.keyPairId
    , privateKey = config.privateKey || this.privateKey
    , custom = false
    ;

  if (!keyPairId || !privateKey) {
    throw new Error('You must set both a Amazon CloudFront keypair ID and an RSA private key for that keypair before using CloudFront#getPrivateUrl');
  }



  resource = 'http' + (config.secure ? 's' : '') + '://' + config.hostname + config.path;

  policy = {
    "Statement": [{
      "Resource": resource,
      "Condition": {
        "DateLessThan": {
          "AWS:EpochTime": config.expires
        }
      }
    }]
  };

  if (config.becomeAvailable) {
    custom = true;

    policy["Statement"][0]["Condition"]["DateGreaterThan"] = {
      "AWS:EpochTime": toUnixTime(config.becomeAvailable)
    }
  }

  if (config.ip) {
    custom = true;

    policy["Statement"][0]["Condition"]["IpAddress"] = {
      "AWS:SourceIp": config.ip
    };
  }

  policy = JSON.stringify(policy);

  signature = crypto.createSign('RSA-SHA1').update(policy).sign(privateKey, 'base64');

  var query = {
    "Signature": signature.replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~'),
    "Key-Pair-Id": keyPairId
  };

  if (custom) {
    query["Policy"] = policy.replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');
  } else {
    query["Expires"] = config.expires;
  }

  resource += (~config.path.indexOf('?') ? '&' : '?') + querystring.stringify(query);
  return resource;
};


function CFObject(client) {
  Object.defineProperty(this, 'client', {
    value: client,
    enumerable: false
  });
}

function Distribution(client, info, data) {
  CFObject.call(this, client);
  this.streaming = !!info.streaming;
  this.id = data.Id;
  this.status = data.Status;
  this.lastModified = new Date(data.LastModifiedTime);
  this.inProgressInvalidationBatches = Number(data.InProgressInvalidationBatches) || 0;
  this.domainName = data.DomainName;
  if (data.ActiveTrustedSigners) {
    var signers = data.ActiveTrustedSigners;
    if (!Array.isArray(signers)) {
      signers = [signers];
    }
    this.activeTrustedSigners = signers.map(function(data) {
      var signer = data.Signer,
      resultingSigner = {};
      if (signer.Self) {
        resultingSigner.self = true;
      } else {
        resultingSigner.awsAccountNumber = signer.AwsAccountNumber;
      }
      resultingSigner.keyPairId = signer.KeyPairId;

      return resultingSigner;
    });
  }

  this.config = new DistributionConfig(this.client, {
    distribution: this.id
  },
  info.isList ? data : data.DistributionConfig);
}
util.inherits(Distribution, CFObject);

Object.defineProperty(Distribution.prototype, 'origin', {
  get: function() {
    return this.config.originDNSName;
  }
});

 ['cname', 'comment', 'enabled'].forEach(function(key) {
  Object.defineProperty(Distribution.prototype, key, {
    get: function() {
      return this.config[key];
    }
  });
});

Distribution.prototype.invalidate =
Distribution.prototype.createInvalidation = function(callerReference, paths, cb) {
  this.client.createInvalidation(this.id, callerReference, paths, cb);
};

function Invalidation(client, info, data) {
  CFObject.call(this, client);
  this.distribution = info.distribution;
  this.id = data.Id;
  this.status = data.Status;
  if (data.InvalidationBatch) {
    this.createTime = new Date(data.CreateTime);
    this.paths = Array.isArray(data.InvalidationBatch.Path) ? data.InvalidationBatch.Path : [data.InvalidationBatch.Path];
    this.callerReference = data.InvalidationBatch.CallerReference;
  } else {
    this.createTime = null;
    this.paths = null;
    this.callerReference = null;
  }
}
util.inherits(Invalidation, CFObject);


function DistributionConfig(client, info, data) {
  CFObject.call(this, client);
  this.distribution = info.distribution;
  this.callerReference = data.CallerReference;

  if (data.S3Origin) {
    this.originType = 's3';
    this.originDNSName = data.S3Origin.DNSName;

    if (data.S3Origin.OriginAccessIdentity) {
      this.originAccessIdentity = data.S3Origin.OriginAccessIdentity.substr('origin-access-identity/cloudfront/'.length);
    }

  } else if (data.CustomOrigin) {
    this.originType = 'custom';
    this.originDNSName = data.CustomOrigin.DNSName;
    this.originHTTPPort = data.CustomOrigin.HTTPPort;
    this.originHTTPSPort = data.CustomOrigin.HTTPSPort;
    this.originProtocolPolicy = data.CustomOrigin.OriginProtocolPolicy;

  }

  this.cname = data.CNAME ? (Array.isArray(data.CNAME) ? data.CNAME : [data.CNAME]) : [];
  this.comment = data.Comment;
  this.enabled = data.Enabled == 'true';
  this.defaultRootObject = data.DefaultRootObject;
  if (data.Logging) {
    this.logging = {
      bucket: data.Logging.Bucket,
      prefix: data.Logging.Prefix
    };
  }
  if (data.RequiredProtocols) {
    this.requiredProtocols = Array.isArray(data.RequiredProtocols.Protocol) ? data.RequiredProtocols.Protocol : [data.RequiredProtocols.Protocol];
  }
}
util.inherits(DistributionConfig, CFObject);


function CloudFrontOriginAccessIdentity(client, info, data) {
  CFObject.call(this, client);

  this.id = data.Id;
  this.s3CanonicalUserId = data.S3CanonicalUserId;

  var oai = info.isList ? data : data.CloudFrontOriginAccessIdentityConfig;
  this.comment = oai.Comment || '';
  if (oai.CallerReference) {
    this.callerReference = oai.CallerReference;
  }

  if (info.etag) {
    this.etag = info.etag;
  }
}
util.inherits(CloudFrontOriginAccessIdentity, CFObject);

CloudFrontOriginAccessIdentity.prototype.setComment = function(comment, cb) {
  if (!this.etag) {
    throw new Error('Missing etag. Did you use CloudFront#listOriginAccessIdentities?');
  }

  var self = this;
  var req = this.client.request('PUT', 'origin-access-identity/cloudfront/' + this.id + '/config', {
    'If-Match': this.etag
  }, function(err, body, res) {
    if (err) return cb(err);

    self.comment = body.CloudFrontOriginAccessIdentityConfig.Comment;
    self.etag = res.headers.etag;

    cb(null, self);
  });
  req.write(this.client.generateOriginAccessIdentityXml(this.callerReference, comment));
  req.end();
};

CloudFrontOriginAccessIdentity.prototype.delete = function(cb) {
  if (!this.etag) {
    throw new Error('Missing etag. Did you use CloudFront#listOriginAccessIdentities?');
  }

  this.client.request('DELETE', 'origin-access-identity/cloudfront/' + this.id, {'If-Match': this.etag}, cb).end();
};

function createClient(key, secret) {
  return new CloudFront(key, secret);
}

module.exports = exports = createClient;
exports.createClient = createClient;
exports.CloudFront = CloudFront;
