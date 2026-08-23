'use client';

import Link, { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

interface TransitionLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
  href: string;
  title?: string;
  'aria-label'?: string;
}

export function TransitionLink({ children, href, className, ...props }: TransitionLinkProps) {
  const router = useRouter();

  const handleTransition = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    e.preventDefault();
    if (!document.startViewTransition) {
      router.push(href);
      return;
    }
    
    document.startViewTransition(() => {
      router.push(href);
    });
  };

  return (
    <Link 
      href={href} 
      onClick={handleTransition} 
      className={className} 
      {...props}
    >
      {children}
    </Link>
  );
}

// Custom hook to replace useRouter for programmatic navigation
export function useTransitionRouter() {
  const router = useRouter();

  return {
    ...router,
    push: (href: string) => {
      if (!document.startViewTransition) {
        router.push(href);
        return;
      }
      document.startViewTransition(() => {
        router.push(href);
      });
    },
    back: () => {
      if (!document.startViewTransition) {
        router.back();
        return;
      }
      document.startViewTransition(() => {
        router.back();
      });
    }
  };
}
