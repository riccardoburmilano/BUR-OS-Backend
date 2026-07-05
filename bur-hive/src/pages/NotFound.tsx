import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      <div className="text-center">
        <div className="text-4xl font-light mb-4">404</div>
        <div>Cell not found.</div>
        <Link to="/" className="mt-4 inline-block text-foreground underline">Return to the hive</Link>
      </div>
    </div>
  );
}
