interface VerificationPageProps {
  params: Promise<{
    code: string;
  }>;
}

export default async function VerificationPage({
  params
}: VerificationPageProps) {
  const { code } = await params;

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-stone-800 bg-stone-900/80 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm uppercase tracking-[0.35em] text-amber-400">
          Public verification
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-stone-50">
          Verification shell
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-400">
          Public verification for transcript or document code <span className="text-stone-200">{code}</span> will be implemented in a later feature phase through a hardened read-only flow.
        </p>
      </div>
    </main>
  );
}

