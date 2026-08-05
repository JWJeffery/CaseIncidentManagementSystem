// packages/shared/src/featureFlags.js
//
// IMPORTANT — read before touching this file.
//
// Proposed Board Policy ECD (Traffic and Parking Controls) has NOT been
// adopted by the FGSD school board as of this writing. Until it is, the
// District has no legal authority to issue court-track citations or tow
// vehicles under that policy. Design doc §1.7 requires that any feature
// depending on ECD be built but shipped DISABLED BY DEFAULT.
//
// Building these features is not authorization to enable them. Do not flip
// these flags to true without Josh Jeffery (District Safety Coordinator)
// explicitly confirming an actual school board resolution is in hand.

const FeatureFlags = Object.freeze({
  // Gates: Citation.citationType === 'Court' (ORS 153.045 court-track citations)
  ECD_COURT_CITATIONS_ENABLED: false,

  // Gates: the entire Tow subsystem (design doc §4.12a — ECD §6-8)
  ECD_TOWING_ENABLED: false,
});

function assertBoardGatedFeatureEnabled(flagName) {
  if (!(flagName in FeatureFlags)) {
    throw new Error(`Unknown feature flag: ${flagName}`);
  }
  if (!FeatureFlags[flagName]) {
    throw new Error(
      `Feature "${flagName}" is disabled pending school board adoption of ` +
      `proposed Board Policy ECD. This is not a bug — see featureFlags.js.`
    );
  }
}

module.exports = {
  FeatureFlags,
  assertBoardGatedFeatureEnabled,
};
