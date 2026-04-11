# AGENTS.md

# CLAUDE

- Claude, if you're reading this, skip this file and go to the .claude directory.

# Expectations

- In all interactions and commit messages, be extremely concise.
- When prompted for large tasks, always formulate a multi-part plan to be executed in phases.
- Provide the pros and cons for design implementations.
- Once prompted to execute plan, provide code changes.
- When creating new files, return here and update the "Project Structure".

# Rules

- Next JS related files must go in the app directory.
- Take into consideration of the boundary lines of the clean architecture when making changes to files.

## Project Structure

- src/
  - Clean architecture styled directory
  - application/
    - Application Layer - holds use cases and interfaces for repositories
  - entities/
    - Entities Layer - holds models and custom errors
  - infrastructure/
    - Infrastructure Layer - holds implementations of repositories and services, and pulls in the interfaces from application
  - interface-adapters/
    - Interface Adapters Layer - holds controllers that serve as an entry point to the system (used in Frameworks & Drivers layer to interact with the system)

- app/
  - Frameworks & Drivers Layer - basically everything Next.js (pages, server actions, components, styles etc...) or whatever "consumes" the app's logic

- nesting/
  - This is the 2D nesting engine

- di/
  - Dependency injection directory that utilizes TSyringe for registering classes and interfaces
