export default function TulaneProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#090909', minHeight: '100vh' }}>
      <header
        style={{
          alignItems: 'center',
          background: '#0a0c0f',
          borderBottom: '1px solid #2a2c33',
          display: 'flex',
          gap: '14px',
          padding: '14px 24px',
        }}
      >
        <img
          src="/staff/norp-logo.png"
          alt="New Orleans Record Press"
          style={{ height: '48px' }}
        />
        <h1
          style={{
            color: '#f2f2f2',
            fontFamily: 'sans-serif',
            fontSize: '20px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          New Orleans Record Press — Production Board
        </h1>
      </header>
      {children}
    </div>
  );
}
