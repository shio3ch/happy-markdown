export function StatusMessage({ id, message }: { id: string; message: string }) {
  return <p id={id} role="status" aria-live="polite">{message}</p>;
}
