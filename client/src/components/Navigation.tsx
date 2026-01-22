import { Link } from "wouter";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function Navigation() {
  const { kakaoUser, refreshKakaoUser } = useUserConfig();

  const handleLogout = () => {
    // kakao_token 쿠키 삭제
    document.cookie = "kakao_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    refreshKakaoUser();
    window.location.href = "/";
  };

  return (
    <nav className="bg-white shadow-md border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <span className="text-blue-600">성지고</span>
            <span className="hidden sm:inline text-gray-900"> 수행평가 공유 플랫폼</span>
            <span className="sm:hidden text-gray-900"> 수행평가</span>
          </Link>

          <div className="flex items-center gap-3">
            {kakaoUser ? (
              <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                <div className="flex flex-col items-end hidden xs:flex">
                  <span className="text-xs text-gray-500 font-medium leading-none mb-1">카카오 연동됨</span>
                  <span className="text-sm font-bold text-gray-900 leading-none">{kakaoUser.nickname}</span>
                </div>
                <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                  <AvatarImage src={kakaoUser.thumbnailImage} alt={kakaoUser.nickname} />
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                    {kakaoUser.nickname.substring(0, 1)}
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
                variant="outline"
                size="sm"
                className="text-xs h-8 rounded-full border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                onClick={() => window.location.href = '/api/kakao/login'}
              >
                카카오 연동하기
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
