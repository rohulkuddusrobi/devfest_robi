/* Phase 4: central validation/status engine (pure logic, no DOM).
 * Statuses: MISSING, EXPIRY_NEEDED, EXPIRED, NOT_PROVIDED, OK.
 * Date handling is date-only (YYYY-MM-DD string comparison) so timezones
 * can never shift the result. Same-day expiry (expiry === deadline) is OK.
 * Exposed as window.TenderValidator for js/app.js.
 */

(function () {
  "use strict";

  var STATUS = {
    MISSING: "MISSING",
    EXPIRY_NEEDED: "EXPIRY_NEEDED",
    EXPIRED: "EXPIRED",
    NOT_PROVIDED: "NOT_PROVIDED",
    OK: "OK"
  };

  // Normalize to a YYYY-MM-DD date-only string, or null when unparseable.
  function normDate(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
  }

  // requirement: { mandatory, has_expiry, ... } from requirements.json.
  // ctx: { matched: boolean, expiryDate: "YYYY-MM-DD"|"", deadline: "YYYY-MM-DD"|null }
  function getRequirementStatus(requirement, ctx) {
    ctx = ctx || {};
    var mandatory = !!(requirement && requirement.mandatory);
    var hasExpiry = !!(requirement && requirement.has_expiry);
    var matched = !!ctx.matched;

    if (!matched) {
      return mandatory ? STATUS.MISSING : STATUS.NOT_PROVIDED;
    }
    if (!hasExpiry) {
      return STATUS.OK;
    }
    var expiry = normDate(ctx.expiryDate);
    if (!expiry) {
      return STATUS.EXPIRY_NEEDED;
    }
    var deadline = normDate(ctx.deadline);
    if (!deadline) {
      return STATUS.OK; // no deadline known: presence of a date is enough
    }
    // Lexicographic compare is exact for fixed-width YYYY-MM-DD.
    if (expiry < deadline) {
      return STATUS.EXPIRED;
    }
    return STATUS.OK; // expiry === deadline (same day) or later -> valid
  }

  function isBlockingStatus(status) {
    return status === STATUS.MISSING ||
      status === STATUS.EXPIRY_NEEDED ||
      status === STATUS.EXPIRED;
  }

  function hasBlockingIssues(statuses) {
    var list = statuses || [];
    for (var i = 0; i < list.length; i++) {
      if (isBlockingStatus(list[i])) return true;
    }
    return false;
  }

  // statusOf: function (requirement) -> status string.
  function calculateSummary(requirements, statusOf) {
    var list = Array.isArray(requirements) ? requirements : [];
    var summary = { total: list.length, mandatory: 0, ready: 0, blocking: 0 };
    list.forEach(function (req) {
      if (req && req.mandatory) summary.mandatory += 1;
      var st = statusOf(req);
      if (st === STATUS.OK) {
        summary.ready += 1;
      } else if (isBlockingStatus(st)) {
        summary.blocking += 1;
      }
      // NOT_PROVIDED is neither ready nor blocking.
    });
    return summary;
  }

  window.TenderValidator = {
    STATUS: STATUS,
    normDate: normDate,
    getRequirementStatus: getRequirementStatus,
    isBlockingStatus: isBlockingStatus,
    hasBlockingIssues: hasBlockingIssues,
    calculateSummary: calculateSummary
  };
})();

