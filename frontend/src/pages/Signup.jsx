import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import ThemeToggle from "../components/ThemeToggle";

export default function Signup() {

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {

    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSignup = async (e) => {

    e.preventDefault();

    try {

      setLoading(true);

      const response = await api.signup(formData);

      localStorage.setItem(
        "token",
        response.access_token
      );

      localStorage.setItem(
        "user",
        JSON.stringify(response.user)
      );

      alert("Signup successful!");

      navigate("/dashboard");

    } catch (error) {

      console.error(error);

      alert(
        error.message || "Signup failed"
      );

    } finally {

      setLoading(false);
    }
  };

  return (

  <div className="
    min-h-screen
    flex items-center justify-center
    bg-slate-100
    dark:bg-[#081018]
    px-4
    relative
    overflow-hidden
    transition-colors
  ">

    {/* Glow Effects */}

    <div className="
      absolute top-[-100px] left-[-100px]
      w-72 h-72
      bg-cyan-500/20
      blur-3xl
      rounded-full
    "/>

    <div className="
      absolute bottom-[-100px] right-[-100px]
      w-72 h-72
      bg-violet-500/20
      blur-3xl
      rounded-full
    "/>

    <form
      className="
      w-full max-w-md
      bg-white dark:bg-[#0d1520]
      border border-black/5 dark:border-white/[0.07]
      rounded-3xl
      p-8
      shadow-2xl
      backdrop-blur-xl
      relative z-10
      "
      onSubmit={handleSignup}
    >

      <div className="flex items-center justify-between mb-8">

        <div>

          <h1 className="
            text-3xl font-bold
            text-slate-900 dark:text-white
          ">
            Welcome Back 👋
          </h1>

          <p className="
            text-sm mt-1
            text-slate-500 dark:text-slate-400
          ">
            Signup to continue
          </p>

        </div>

        <ThemeToggle />

      </div>

      <div className="space-y-5">
<input
  type="text"
  name="name"
  placeholder="Full Name"
  value={formData.name}
  onChange={handleChange}
  required
  className="
  w-full px-4 py-3
  rounded-2xl
  bg-slate-100 dark:bg-white/[0.03]
  border border-slate-200 dark:border-white/[0.08]
  text-slate-900 dark:text-white
  placeholder:text-slate-400
  focus:outline-none
  focus:border-[#00d4ff]/40
  transition-all
  "
/>

        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
          className="
          w-full px-4 py-3
          rounded-2xl
          bg-slate-100 dark:bg-white/[0.03]
          border border-slate-200 dark:border-white/[0.08]
          text-slate-900 dark:text-white
          placeholder:text-slate-400
          focus:outline-none
          focus:border-[#00d4ff]/40
          transition-all
          "
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
          className="
          w-full px-4 py-3
          rounded-2xl
          bg-slate-100 dark:bg-white/[0.03]
          border border-slate-200 dark:border-white/[0.08]
          text-slate-900 dark:text-white
          placeholder:text-slate-400
          focus:outline-none
          focus:border-[#00d4ff]/40
          transition-all
          "
        />

        <button
          type="submit"
          className="
          w-full py-3
          rounded-2xl
          bg-[#00d4ff]/10
          border border-[#00d4ff]/30
          text-[#00d4ff]
          font-semibold
          hover:bg-[#00d4ff]/20
          transition-all
          "
        >

          {
            loading
              ? "Signing up..."
              : "Signup"
          }

        </button>

      </div>

      {/* <p className="
        mt-6 text-center text-sm
        text-slate-500 dark:text-slate-400
      ">
        Don't have an account?

        <Link
          to="/signup"
          className="
          text-[#00d4ff]
          hover:underline
          ml-1
          "
        >
          Signup
        </Link>

      </p> */}

    </form>

  </div>
);
}