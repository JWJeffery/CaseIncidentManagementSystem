// server/featureGate.js
// Thin Express middleware around @fgsd/shared's board-authority feature
// flags (design doc §1.7). Used to block Court-track citation creation and
// all Tow creation until Josh confirms actual school board adoption of
// proposed Board Policy ECD. See @fgsd/shared/src/featureFlags.js for the
// flags themselves — do not duplicate the flag values here.
const { assertBoardGatedFeatureEnabled } = require('@fgsd/shared');

function requireFeature(flagName) {
  return (req, res, next) => {
    try {
      assertBoardGatedFeatureEnabled(flagName);
      next();
    } catch (err) {
      res.status(403).json({
        error: 'Feature disabled pending school board action.',
        detail: err.message,
      });
    }
  };
}

module.exports = { requireFeature };
