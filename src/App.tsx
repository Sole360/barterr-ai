import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase/config";

function App() {
  console.log("Firebase Project ID:", auth.app.options.projectId);

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">Barterr</h1>
        <p className="text-gray-600">Sneaker Trading, Made Simple. 🔥</p>
        <p className="text-sm text-gray-400">
          Environment: {auth.app.options.projectId}
        </p>
        <Button>Get Started</Button>
      </div>
    </div>
  );
}

export default App;
