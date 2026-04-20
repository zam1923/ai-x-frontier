import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import EntityPage from "@/pages/EntityPage";
import ArticlePage from "@/pages/ArticlePage";
import AdminPanel from "@/pages/AdminPanel";
import NotFound from "@/pages/not-found";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Router hook={useHashLocation}>
          <Sidebar />
          <main className="flex-1 overflow-y-auto overscroll-contain">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/entity/:id" component={EntityPage} />
              <Route path="/article/:id" component={ArticlePage} />
              <Route path="/admin" component={AdminPanel} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </Router>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
