import { Link } from "wouter";

export default function Navigation() {
  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-2xl font-bold">
            <span className="text-blue-600">성지고</span>
            <span className="text-gray-900"> 수행평가 공유 플랫폼</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
