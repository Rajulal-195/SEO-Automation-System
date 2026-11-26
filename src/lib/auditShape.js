// src/lib/auditShape.js
// One place that decides what each kind of viewer may see of an audit.

/** Dates become ISO strings so the object can go to the browser as plain JSON. */
const toPlain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param audit  row with status, progress, currentStep, result, ..., client {id,name,websiteUrl}, notifications
 * @param role   'admin' sees everything except the server file path;
 *               'client' gets the report only (no internals, no delivery log, no error text).
 */
function shapeAudit(audit, role) {
  const hasPdf = audit.status === 'COMPLETED' && audit.result !== null && audit.result !== undefined;
  const base = {
    id: audit.id,
    clientId: audit.clientId,
    status: audit.status,
    progress: audit.progress,
    currentStep: audit.currentStep,
    overallScore: audit.overallScore,
    scoreBreakdown: audit.scoreBreakdown,
    result: audit.result,
    hasPdf,
    createdAt: audit.createdAt,
    completedAt: audit.completedAt,
    client: audit.client ? { id: audit.client.id, name: audit.client.name, websiteUrl: audit.client.websiteUrl } : undefined,
  };
  if (role === 'admin') {
    return toPlain({
      ...base,
      triggeredBy: audit.triggeredBy,
      errorMessage: audit.errorMessage,
      notifications: audit.notifications || [],
    });
  }
  return toPlain(base);
}

module.exports = { shapeAudit, toPlain };
