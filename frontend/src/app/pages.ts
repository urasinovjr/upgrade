import { lazy } from "react";
export const pages = {
  homework: () => import("../features/homework/Homework"),
  dashboard: () => import("../features/dashboard/Dashboard"),
  works: () => import("../features/works/Works"),
  students: () => import("../features/students/Students"),
  student: () => import("../features/knowledge/StudentDetail"),
};

export const Works = lazy(pages.works);
export const Homework = lazy(pages.homework);
export const StudentPortal = lazy(() => import("../features/homework/StudentPortal"));
export const StudentAuth = lazy(() => import("../features/homework/StudentAuth"));
export const Dashboard = lazy(pages.dashboard);
export const Review = lazy(() => import("../features/review/Review"));
export const Students = lazy(pages.students);
export const StudentDetail = lazy(pages.student);
export const Report = lazy(() => import("../features/reports/Report"));
export const States = lazy(() => import("../features/States"));
export const Login = lazy(() => import("../features/auth/Login"));
export const Register = lazy(() => import("../features/auth/Register"));
export const ConfirmEmail = lazy(() => import("../features/auth/ConfirmEmail"));
export const ResetRequest = lazy(() => import("../features/auth/ResetRequest"));
export const ResetPassword = lazy(() => import("../features/auth/ResetPassword"));
export const ProviderCallback = lazy(() => import("../features/auth/ProviderCallback"));
export const AccountSettings = lazy(() => import("../features/account/AccountSettings"));
export const Subscription = lazy(() => import("../features/account/Subscription"));
export const Stopwatch = lazy(() => import("../features/timing/Stopwatch"));
export const Landing = lazy(() => import("../features/landing/Landing"));
