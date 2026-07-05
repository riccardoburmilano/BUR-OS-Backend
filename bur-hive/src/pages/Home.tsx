import { TopBar } from "@/components/bur/TopBar";
import { Hive } from "@/components/bur/Hive";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-16">
        <div className="mb-14 text-center">
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">The hive</div>
          <h1 className="mt-3 text-4xl font-light tracking-tight md:text-5xl">
            Every cell is a module.
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Enter a cell to open its surface. The hive scales as new modules are added.
          </p>
        </div>
        <Hive />
        <footer className="mt-16 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          BUR · Browser for Universal Revenue
        </footer>
      </main>
    </div>
  );
}
