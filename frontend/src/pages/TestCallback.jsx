import { useEffect } from 'react';

export default function TestCallback() {
  useEffect(() => {
    console.log('[TestCallback] This page was reached!');
    console.log('[TestCallback] URL:', window.location.href);
    console.log('[TestCallback] Search:', window.location.search);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Test Callback Page</h1>
      <p>URL: {window.location.href}</p>
      <p>Search: {window.location.search}</p>
    </div>
  );
}
