import { Moon, Sun } from "lucide-react";
import useTheme from "../context/useTheme";
export default function ThemeToggle() {

  const {
    theme,
    toggleTheme
  } = useTheme();

  return (

    <button
      onClick={toggleTheme}
      className="
      p-2 rounded-xl
      border border-white/10
      bg-white/[0.04]
      dark:bg-white/[0.04]
      bg-slate-200
      transition-all
      hover:scale-105
      "
    >

      {
        theme === "dark"
          ? <Sun size={18} className="text-yellow-400"/>
          : <Moon size={18} className="text-slate-700"/>
      }

    </button>
  );
}
