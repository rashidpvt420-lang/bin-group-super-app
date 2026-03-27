// backend/src/middleware/firebase-auth.js
const admin = require('firebase-admin');

async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'No token provided',
    });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Token invalid or expired',
    });
  }
}

async function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'USER';
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Only ${roles.join(', ')} can access this`,
      });
    }
    next();
  };
}

/**
 * verifyAppCheck - Shield Mode (Move 5)
 * Ensures requests originate from a verified client instance.
 */
const verifyAppCheck = async (req, res, next) => {
    const appCheckToken = req.header("x-firebase-appcheck");

    if (!appCheckToken) {
        return res.status(401).json({ error: "App Check token missing. Access Denied." });
    }

    try {
        await admin.appCheck().verifyToken(appCheckToken);
        next();
    } catch (err) {
        console.error("🚫 [App Check Failure]", err.message);
        // During rapid development, allow pass-through if env is set, 
        // but log clearly for DLD audit.
        if (process.env.APP_CHECK_DEBUG_MODE === 'true') {
            console.warn("⚠️ SHIELD WARNING: App Check failed but DEBUG_MODE is ON.");
            return next();
        }
        res.status(401).json({ error: "Invalid App Check token." });
    }
};

module.exports = {
  verifyToken,
  requireRole,
  verifyAppCheck
};
