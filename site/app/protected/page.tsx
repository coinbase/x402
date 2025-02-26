export default function ProtectedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">Protected Content</h1>
        <p className="text-lg">
          If you can see this, your payment was successful!
        </p>
      </div>
    </div>
  );
}
