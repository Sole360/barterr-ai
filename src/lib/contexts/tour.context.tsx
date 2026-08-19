import { createContext, useContext, useState, type ReactNode } from "react";

interface TourContextValue {
  isRunning: boolean;
  startTour: () => void;
  stopTour: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export const TourProvider = ({ children }: { children: ReactNode }) => {
  const [isRunning, setIsRunning] = useState(false);

  return (
    <TourContext.Provider
      value={{
        isRunning,
        startTour: () => setIsRunning(true),
        stopTour: () => setIsRunning(false),
      }}
    >
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
};
