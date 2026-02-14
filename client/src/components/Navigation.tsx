import { Link } from "wouter";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function Navigation() {
  const { kakaoUser, refreshKakaoUser } = useUserConfig();

  const handleLogout = async () => {
    try {
      await fetch('/api/kakao/logout');
      await refreshKakaoUser();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <span className="text-blue-600">수행 일정공유</span>
            <span className="hidden xs:inline text-gray-900"> 수행평가 공유 플랫폼</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {kakaoUser ? (
              <div className="flex items-center gap-2 sm:gap-3 bg-gray-50 pr-1 pl-3 py-1 rounded-full border border-gray-100">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] text-gray-400 font-medium leading-none mb-1">카카오 연동됨</span>
                  <span className="text-sm font-bold text-gray-800 leading-none">{kakaoUser.nickname}</span>
                </div>
                <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                  <AvatarImage src={kakaoUser.thumbnailImage} alt={kakaoUser.nickname} />
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-xs font-bold">
                    {kakaoUser.nickname ? kakaoUser.nickname.substring(0, 1) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                  onClick={handleLogout}
                  title="로그아웃"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 h-9 rounded-full px-4 font-bold text-xs"
                onClick={() => window.location.href = '/api/kakao/login'}
              >
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3C6.48 3 2 6.93 2 11.75c0 3.14 2.13 5.88 5.28 7.24-.22 1.02-.89 3.61-.92 3.87 0 .03-.03.17.09.23.12.07.29.04.29.04.39-.07 4.54-3.04 5.26-3.61 12 .38 12 .38 12-7.77 12-11.75C22 6.93 17.52 3 12 3z" />
                </svg>
                카카오 연동
              </Button>
            )}
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xs font-normal">
                관리사무소
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
