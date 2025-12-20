import { Link } from "wouter";

export default function Navigation() {
  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            성지고 위키
          </Link>
        </div>
      </div>
    </nav>
  );
}
