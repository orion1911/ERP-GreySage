const { AuditLog } = require('../mongodb_schema');

// Audit logging is an OBSERVER — it must never fail the operation it observes. This used to
// throw on any AuditLog validation error (e.g. an entity value missing from the schema enum),
// which surfaced as a 400 AFTER the business write had already committed: the manual-dispatch
// entry existed, the caches were recalculated, but the user saw "Validation failed" — and a
// retry created a duplicate. Fail open (same philosophy as the cache layer) and make the
// miss visible in server logs instead.
const logAction = async (userId, action, entity, entityId, details) => {
  try {
    const auditLog = new AuditLog({ userId, action, entity, entityId, details });
    await auditLog.save();
  } catch (err) {
    console.error(`AuditLog write failed (action=${action}, entity=${entity}):`, err.message);
  }
};

module.exports = { logAction };
