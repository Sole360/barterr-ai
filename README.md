# Barterr AI

A modern sneaker trading platform that connects sneaker enthusiasts to trade their collections. Built with React, TypeScript, and Firebase.

## Overview

Barterr AI is a peer-to-peer sneaker trading platform that allows users to discover, list, and trade sneakers from their collections. The platform includes AI-powered trade likelihood predictions to help users make informed trading decisions.

## Features

### Sneaker Marketplace
- Browse sneakers available for trade by brand (Nike, Adidas, Jordan, New Balance, and more)
- Search and filter available sneakers using Algolia-powered search
- View detailed sneaker information including condition, size, and photos
- Add sneakers from your personal collection to the marketplace

### Trading System
- Compose trade offers combining sneakers and cash
- AI-powered trade likelihood scores that predict trade success probability
- Review trades before sending with detailed breakdowns
- Manage incoming and outgoing trade requests through a unified inbox
- Track trade history and negotiation offers
- Confirm trades and manage payment workflows

### User Profiles
- Personal sneaker collections and wishlists
- User ratings and reputation system
- Detailed sneaker condition tracking (new/used with grading system)
- Track box, insoles, laces, and flaws for each sneaker
- Location and response time metrics
- Photo uploads for sneaker verification

### Authentication
- Email/password authentication
- Email verification flow
- Password reset functionality
- User onboarding process

## Tech Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Server state management
- **Zustand** - Client state management
- **React Hook Form** - Form handling
- **Zod** - Schema validation

### UI & Styling
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **class-variance-authority** - Component variants

### Backend & Services
- **Firebase Authentication** - User authentication
- **Firestore** - NoSQL database
- **Firebase Storage** - Image and file storage
- **Algolia** - Search functionality

## Project Structure

```
src/
├── app/                    # Page components
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main discovery/marketplace
│   ├── profile/           # User profile pages
│   └── trades/            # Trade flow pages
├── components/
│   ├── dialogs/           # Modal dialogs
│   ├── shared/            # Shared components
│   └── ui/                # Base UI components (Radix-based)
├── lib/
│   ├── api/               # External API services
│   ├── algolia/           # Search configuration
│   ├── firebase/          # Firebase services & hooks
│   └── contexts/          # React contexts
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn
- Firebase project with Firestore and Authentication enabled
- Algolia account for search functionality

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd barterr-ai
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
Create a `.env` file in the root directory with your Firebase and Algolia credentials:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_ALGOLIA_APP_ID=your_algolia_app_id
VITE_ALGOLIA_SEARCH_KEY=your_algolia_search_key
```

4. Start the development server
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development environment
- `npm run build:prod` - Build for production environment
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Key Data Models

### User
User profiles with authentication, contact info, location, and collection stats.

### Sneaker
Individual sneaker items with brand, size, condition, photos, and accessory details (box, insoles, laces).

### Post
Public listings of sneakers available for trade with owner and wisher information.

### Trade
Trade requests between users including offers, negotiation history, payment status, and AI-powered likelihood scores.

### Listing
Detailed sneaker listings with condition grades, photos, and approval status.

## Trade Flow

1. **Discovery** - Users browse available sneakers on the dashboard
2. **Compose** - Users create trade offers by selecting their items and the items they want
3. **Review** - AI analyzes the trade and provides a likelihood score before sending
4. **Negotiate** - Users can accept, decline, or counter-offer trades
5. **Confirm** - Both parties confirm and complete payment
6. **Complete** - Trade is finalized with tracking and delivery information

## Contributing

This is a private project. Please contact the repository owner for contribution guidelines.

## License

Private - All rights reserved
