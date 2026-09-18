PerkUp

::: {align="center"}

PerkUp: Smart Rewards and Promotion Management Platform

A modern web application that helps businesses create, manage, and
distribute promotions while allowing customers to discover rewards and
engage with participating stores.
:::

Overview

PerkUp is a web-based rewards and promotion platform designed for store
owners, customers, staff, and administrators.

The platform allows store owners to publish promotions, configure reward
mechanics, manage availability, and provide customers with an easier way
to discover and redeem offers.

Features

Store Owner

Create and manage promotions

Upload promotion banners

Configure promotion details and redemption instructions

Set location-based availability using map integration

Manage customer rewards and store information

Customer

Browse available promotions

View store offers

Redeem available rewards

Interact with participating businesses

Staff

Support store operations

Assist with promotion validation and management

Admin

Manage platform data

Monitor system activities

Maintain platform consistency

Technology Stack

Frontend

React 19

TypeScript

Vite

Tailwind CSS

React Router

Leaflet / React Leaflet

Motion animations

Backend and Services

Supabase

Firebase configuration support

Additional Libraries

QR code generation and scanning

PDF generation

Date utilities

Form and UI utilities

Project Structure

src/
├── components/       # Reusable UI components
├── contexts/         # Application state providers
├── lib/              # Utility functions and services
├── pages/
│   ├── admin/        # Admin pages
│   ├── customer/     # Customer pages
│   ├── staff/        # Staff pages
│   └── store-owner/  # Store owner pages
└── test/             # Testing files

Installation

Prerequisites

Node.js

npm

Setup

Clone the repository:

git clone https://github.com/zekeejbc-lgtm/PerkUp.git

Go to the project directory:

cd PerkUp

Install dependencies:

npm install

Create your environment configuration file:

.env

Add the required API keys and service configurations.

Development

Run the development server:

npm run dev

The application will run locally using Vite.

Available Scripts

Command                  Description

npm run dev            Start development server
npm run build          Create production build
npm run preview        Preview production build
npm run lint           TypeScript validation
npm run test           Run tests
npm run test:watch     Run tests in watch mode
npm run check:brand    Check branding consistency
npm run test:auditor   Run auditor checks

Environment Variables

The project requires environment configuration for connected services.

Example:

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

Do not commit private keys or sensitive credentials.

Development Guidelines

Keep components reusable and organized.

Follow TypeScript typing practices.

Maintain consistent Tailwind styling patterns.

Test changes before deployment.

Avoid committing environment files containing secrets.

Deployment

The project includes Vercel configuration support.

Build the project:

npm run build

Deploy the generated application using your preferred hosting platform.

License

This project is currently private and intended for authorized
development use.