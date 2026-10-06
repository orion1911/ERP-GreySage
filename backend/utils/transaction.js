const mongoose = require('mongoose');

/**
 * Run `fn(session)` inside a MongoDB transaction via the driver's withTransaction(), which
 * RETRIES the whole callback on TransientTransactionError (e.g. a WriteConflict with another
 * request touching the same lot) and on UnknownTransactionCommitResult. Anything else thrown
 * inside `fn` (HttpError, ValidationError…) aborts the transaction and propagates unchanged.
 *
 * Rules for `fn`:
 *   • every read and write passes `session` (withSession / sessionOpts below);
 *   • no Promise.all over operations sharing the session — run them sequentially;
 *   • load documents INSIDE fn, so a retry starts from fresh state;
 *   • no non-DB side effects (cache bumps, audit log, email) — do those after it returns.
 */
const runInTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

/** Attach a session to a Mongoose Query/Aggregate only when one is given. */
const withSession = (queryOrAggregate, session) =>
  (session ? queryOrAggregate.session(session) : queryOrAggregate);

/** Options object for save() / create([...]) / updateOne() / findByIdAndUpdate(). */
const sessionOpts = (session) => (session ? { session } : {});

module.exports = { runInTransaction, withSession, sessionOpts };
