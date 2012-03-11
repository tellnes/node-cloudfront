var https = require('https')
  , crypto = require('crypto')
  , data2xml = require('data2xml')
  , xml2js = require('xml2js')
  , querystring = require('querystring')
  , util = require('util')


function CloudFrontError(name, message, code) {
  Error.call(this, message || name);
  this.name = name;
  this.code = code;
}
util.inherits(CloudFrontError, Error);

CloudFrontError.prototype.toString = function() {
  return this.code + ': ' + this.message;
};


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
  info.nextMaker = body.NextMarker;
  info.maxItems = body.MaxItems;

  var listKey = DataConstr.name + 'Summary';
  if (opts.streaming) { listKey = 'Streaming' + listKey; }

  info.list = body[listKey].map(function(data) {
    return new DataConstr(that, opts, data);
  });

  return info;
}


function CloudFront(key, secret) {
  this.key = key;
  this.secret = secret;
}
CloudFront.version = '2010-11-01';
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


CloudFront.prototype.generateDistributionConfig = function(config) {
  var data = {
    CallerReference: config.callerReference,
    CNAME: config.cname,
    Comment: config.comment,
    Enabled: config.enabled,
    DefaultRootObject: config.defaultRootObject
  };
  if (config.originType == 's3') {
    data.S3Origin = {
      DNSName: config.originDNSName,
      OriginAccessIdentity: config.originAccessIdentity
    };
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
  return data2xml('InvalidationBatch', data);
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
  req.write(this.generateDistributionConfig(config));
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

    var item = new Distribution(self, {}, body);
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

    var item = new DistributionConfig(self, {distribution: distribution}, body);
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
  var req = this.request('POST', (config.streaming ? 'streaming-' : '') + 'distribution/' + distribution, {'If-Match': config.etag}, function(err, body, res) {
    if (err) return cb(err);

    var item = new DistributionConfig(self, {distribution: distribution}, body);
    item.etag = res.headers.etag;
    cb(null, item);
  });
  req.write(this.generateDistributionConfig(config));
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
  var self = this;
  this.request('GET', listOptsToPath('distribution', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {streaming: opts.streaming, isList: true}, Distribution, body);
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
  if (!distribution) { throw new TypeError('First argument must be a valid distribution id'); }
  var req = this.request('POST', 'distribution/' + distribution + '/invalidation', cb);
  req.write(this.generateInvalidationXml(callerReference, paths));
  req.end();
};

CloudFront.prototype.getInvalidation = function(distribution, id, cb) {
  var self = this;
  this.request('GET', 'distribution/' + distribution + '/invalidation/' + id, function(err, body) {
    if (err) return cb(err);

    var item = new Invalidation(self, {distribution: distribution}, body);
    cb(null, item);
  }).end();
};

CloudFront.prototype.listInvalidations = function(distribution, opts, cb) {
  var self = this;
  this.request('GET', listOptsToPath('distribution/' + distribution + '/invalidation', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {distribution: distribution}, Invalidation, body);
    cb(null, info.list, info);
  }).end();
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

  this.config = new DistributionConfig(this.client, {distribution: this.id}, info.isList ? data : data.DistributionConfig);
}
util.inherits(Distribution, CFObject);

['origin', 'cname', 'comment', 'enabled'].forEach(function(key) {
  Object.defineProperty(Distribution.prototype, key, {
    get: function() {
      return this.config[key];
    }
  });
});

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

  if (data.S3Origin) {
    this.originType = 's3';
    this.originDNSName = data.S3Origin.DNSName;
    this.originAccessIdentity = data.S3Origin.OriginAccessIdentity;

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



function createClient(key, secret) {
  return new CloudFront(key, secret);
}

module.exports = exports = createClient
exports.createClient = createClient;
exports.CloudFront = CloudFront;
