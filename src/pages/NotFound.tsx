import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative flex min-h-screen flex-col bg-void"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.785_0.132_78/8%),transparent_60%)]" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-4">
        <div className="text-center">
          <p className="label-caps text-gilt">Off the map</p>
          <h1 className="mt-4 font-display text-[18vw] leading-none tracking-[0.06em] text-vellum sm:text-[9rem]">
            404
          </h1>
          <div className="rule-gold mx-auto mt-5 h-px w-56" />
          <p className="mt-5 font-serif text-lg leading-8 text-ash">
            This page isn't in any chapter of the manuscript.
          </p>
          <Button
            onClick={() => navigate("/")}
            className="mt-7 h-11 cursor-pointer gap-2 bg-gilt px-6 text-void hover:bg-gilt/90"
          >
            Back to the plot grid
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
