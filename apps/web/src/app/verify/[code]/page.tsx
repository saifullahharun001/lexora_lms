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
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white/92 p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.22em] text-teal-700">
          Public verification
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">
          Verification shell
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Public verification for transcript or document code <span className="font-medium text-slate-900">{code}</span> will be implemented in a later feature phase through a read-only academic record flow.
        </p>
      </div>
    </main>
  );
}
