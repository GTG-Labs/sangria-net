export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>Sangria Merchant — Next.js</h1>
      <p>Routes:</p>
      <ul>
        <li>
          <code>GET /api</code> → free
        </li>
        <li>
          <code>GET /api/premium</code> → $0.01 (fixed)
        </li>
      </ul>
    </main>
  );
}
