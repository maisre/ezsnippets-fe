/**
 * How many snippets the editor's scratch pad holds.
 *
 * Mirrors SCRATCH_PAD_LIMIT in ez-api's src/common/scratch-pad.ts, which is
 * the one that actually enforces it — this copy exists so the UI can disable
 * the park control at the limit instead of letting the user click it and
 * collecting a 400. If the two ever drift, the server wins and the editor
 * surfaces its message.
 */
export const SCRATCH_PAD_LIMIT = 20;
