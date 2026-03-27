const { CRITICAL_CATEGORIES } = require("../config/constants");
const { findOwner, enforceTwoStrike } = require("../services/rules");

function requireVisualGate(req, res, next) {
  const { photoUrl, videoUrl } = req.body;
  if (!photoUrl && !videoUrl) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Photo or video is required",
      code: "VISUAL_GATE_FAILED",
    });
  }
  return next();
}

function emergencyWarning(isEmergency) {
  if (!isEmergency) return null;
  return "Misuse of SOS for routine issues will result in a AED 150 Fine.";
}

function enforceOwnerSuspension(req, res, next) {
  const ownerId = req.params.ownerId || req.body.ownerId;
  if (!ownerId) return next();

  const owner = findOwner(ownerId);
  if (!owner) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Owner not found",
    });
  }

  const suspensionState = enforceTwoStrike(ownerId);
  if (suspensionState?.suspended) {
    return res.status(403).json({
      error: "SUSPENDED_ACCOUNT",
      message: "Owner account suspended due to unpaid invoices",
      code: "TWO_STRIKE_RULE",
    });
  }

  return next();
}

function requireLiabilityWaiver(req, res, next) {
  const { ticketCategory, acceptLiability } = req.body;
  const normalized = String(ticketCategory || "").toUpperCase();

  if (CRITICAL_CATEGORIES.has(normalized) && acceptLiability !== true) {
    return res.status(400).json({
      error: "LIABILITY_WAIVER_REQUIRED",
      message:
        "I accept full legal liability for municipal fines and damages caused by delaying this repair.",
    });
  }

  return next();
}

module.exports = {
  requireVisualGate,
  emergencyWarning,
  enforceOwnerSuspension,
  requireLiabilityWaiver,
};
