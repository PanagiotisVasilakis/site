/**
 * Advanced SEO Utilities
 * Provides comprehensive SEO optimization including structured data, meta tags, and Open Graph
 */

import { Metadata } from 'next';

// Structured Data Types
interface Organization {
  '@type': 'Organization';
  name: string;
  url: string;
  logo?: string;
  sameAs?: string[];
  contactPoint?: ContactPoint[];
  address?: PostalAddress;
}

interface ContactPoint {
  '@type': 'ContactPoint';
  telephone?: string;
  contactType: 'customer service' | 'technical support' | 'billing support' | 'emergency';
  email?: string;
  availableLanguage?: string[];
}

interface PostalAddress {
  '@type': 'PostalAddress';
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

interface WebSite {
  '@type': 'WebSite';
  name: string;
  url: string;
  potentialAction?: SearchAction;
  publisher?: Organization;
}

interface SearchAction {
  '@type': 'SearchAction';
  target: {
    '@type': 'EntryPoint';
    urlTemplate: string;
  };
  'query-input': string;
}

interface WebPage {
  '@type': 'WebPage';
  name: string;
  description: string;
  url: string;
  mainEntity?: LocalBusiness | Article | Product;
  breadcrumb?: BreadcrumbList;
  publisher?: Organization;
  datePublished?: string;
  dateModified?: string;
}

interface LocalBusiness {
  '@type': 'LocalBusiness';
  name: string;
  description: string;
  url: string;
  telephone?: string;
  address?: PostalAddress;
  geo?: GeoCoordinates;
  openingHours?: string[];
  priceRange?: string;
  image?: string[];
  aggregateRating?: AggregateRating;
  review?: Review[];
}

interface GeoCoordinates {
  '@type': 'GeoCoordinates';
  latitude: number;
  longitude: number;
}

interface AggregateRating {
  '@type': 'AggregateRating';
  ratingValue: number;
  reviewCount: number;
  bestRating?: number;
  worstRating?: number;
}

interface Review {
  '@type': 'Review';
  author: {
    '@type': 'Person';
    name: string;
  };
  datePublished: string;
  reviewBody: string;
  reviewRating: {
    '@type': 'Rating';
    ratingValue: number;
    bestRating?: number;
  };
}

interface Article {
  '@type': 'Article';
  headline: string;
  description: string;
  author: {
    '@type': 'Person';
    name: string;
  };
  datePublished: string;
  dateModified?: string;
  image?: string[];
  publisher?: Organization;
  mainEntityOfPage?: string;
}

interface Product {
  '@type': 'Product';
  name: string;
  description: string;
  image?: string[];
  brand?: {
    '@type': 'Brand';
    name: string;
  };
  offers?: Offer[];
  aggregateRating?: AggregateRating;
  review?: Review[];
}

interface Offer {
  '@type': 'Offer';
  price: string;
  priceCurrency: string;
  availability: string;
  validFrom?: string;
  validThrough?: string;
}

interface BreadcrumbList {
  '@type': 'BreadcrumbList';
  itemListElement: ListItem[];
}

interface ListItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item: string;
}

// SEO Configuration Interface
interface SEOConfig {
  title: string;
  description: string;
  url: string;
  siteName: string;
  locale?: string;
  type?: 'website' | 'article' | 'profile';
  images?: {
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  }[];
  keywords?: string[];
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  canonical?: string;
  robots?: {
    index?: boolean;
    follow?: boolean;
    archive?: boolean;
    snippet?: boolean;
    'max-image-preview'?: 'none' | 'standard' | 'large';
    'max-snippet'?: number;
    'max-video-preview'?: number;
  };
}

class SEOManager {
  private baseConfig: {
    siteName: string;
    siteUrl: string;
    defaultTitle: string;
    defaultDescription: string;
    defaultImage: string;
    organization: Organization;
    locale: string;
    themeColor: string;
  };

  constructor(baseConfig: SEOManager['baseConfig']) {
    this.baseConfig = baseConfig;
  }

  // Generate comprehensive metadata for Next.js
  generateMetadata(config: SEOConfig): Metadata {
    const title = config.title === this.baseConfig.defaultTitle 
      ? config.title 
      : `${config.title} | ${this.baseConfig.siteName}`;

    const images = config.images || [{
      url: this.baseConfig.defaultImage,
      width: 1200,
      height: 630,
      alt: config.title,
    }];

    const robots = config.robots || {
      index: true,
      follow: true,
      'max-image-preview': 'large' as const,
      'max-snippet': -1,
      'max-video-preview': -1,
    };

    return {
      title,
      description: config.description,
      keywords: config.keywords?.join(', '),
      authors: config.author ? [{ name: config.author }] : undefined,
      creator: config.author,
      publisher: this.baseConfig.organization.name,
      applicationName: this.baseConfig.siteName,
      generator: 'Next.js',
      referrer: 'origin-when-cross-origin',
      colorScheme: 'light dark',
      themeColor: this.baseConfig.themeColor,
      viewport: {
        width: 'device-width',
        initialScale: 1,
        maximumScale: 5,
        userScalable: true,
      },
      robots: this.formatRobots(robots),
      alternates: {
        canonical: config.canonical || config.url,
        languages: {
          [this.baseConfig.locale]: config.url,
        },
      },
      openGraph: {
        type: config.type || 'website',
        locale: config.locale || this.baseConfig.locale,
        url: config.url,
        siteName: config.siteName || this.baseConfig.siteName,
        title,
        description: config.description,
        images: images.map(img => ({
          url: img.url,
          width: img.width,
          height: img.height,
          alt: img.alt,
        })),
        publishedTime: config.publishedTime,
        modifiedTime: config.modifiedTime,
        section: config.section,
        tags: config.tags,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description: config.description,
        images: images.map(img => img.url),
        creator: config.author ? `@${config.author}` : undefined,
        site: `@${this.baseConfig.siteName}`,
      },
      icons: {
        icon: [
          { url: '/favicon.ico', sizes: 'any' },
          { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
          { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        ],
        apple: [
          { url: '/apple-touch-icon.png', sizes: '180x180' },
        ],
      },
      manifest: '/app.webmanifest',
    };
  }

  private formatRobots(robots: NonNullable<SEOConfig['robots']>): string {
    const parts: string[] = [];
    
    if (robots.index === false) parts.push('noindex');
    if (robots.follow === false) parts.push('nofollow');
    if (robots.archive === false) parts.push('noarchive');
    if (robots.snippet === false) parts.push('nosnippet');
    
    if (robots['max-image-preview']) {
      parts.push(`max-image-preview:${robots['max-image-preview']}`);
    }
    if (robots['max-snippet']) {
      parts.push(`max-snippet:${robots['max-snippet']}`);
    }
    if (robots['max-video-preview']) {
      parts.push(`max-video-preview:${robots['max-video-preview']}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'index, follow';
  }

  // Generate structured data for organization
  generateOrganizationLD(): string {
    const structuredData = {
      '@context': 'https://schema.org',
      ...this.baseConfig.organization,
    };

    return JSON.stringify(structuredData, null, 0);
  }

  // Generate structured data for website
  generateWebSiteLD(searchUrl?: string): string {
    const website: WebSite = {
      '@type': 'WebSite',
      name: this.baseConfig.siteName,
      url: this.baseConfig.siteUrl,
      publisher: this.baseConfig.organization,
    };

    if (searchUrl) {
      website.potentialAction = {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${searchUrl}?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      };
    }

    const structuredData = {
      '@context': 'https://schema.org',
      ...website,
    };

    return JSON.stringify(structuredData, null, 0);
  }

  // Generate structured data for web page
  generateWebPageLD(config: {
    name: string;
    description: string;
    url: string;
    datePublished?: string;
    dateModified?: string;
    breadcrumb?: { name: string; url: string }[];
    mainEntity?: LocalBusiness | Article | Product;
  }): string {
    const webPage: WebPage = {
      '@type': 'WebPage',
      name: config.name,
      description: config.description,
      url: config.url,
      publisher: this.baseConfig.organization,
      datePublished: config.datePublished,
      dateModified: config.dateModified,
      mainEntity: config.mainEntity,
    };

    if (config.breadcrumb && config.breadcrumb.length > 0) {
      webPage.breadcrumb = {
        '@type': 'BreadcrumbList',
        itemListElement: config.breadcrumb.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      };
    }

    const structuredData = {
      '@context': 'https://schema.org',
      ...webPage,
    };

    return JSON.stringify(structuredData, null, 0);
  }

  // Generate structured data for local business
  generateLocalBusinessLD(business: {
    name: string;
    description: string;
    url: string;
    telephone?: string;
    address?: Omit<PostalAddress, '@type'>;
    coordinates?: { latitude: number; longitude: number };
    openingHours?: string[];
    priceRange?: string;
    images?: string[];
    rating?: { value: number; count: number; best?: number; worst?: number };
    reviews?: {
      author: string;
      date: string;
      body: string;
      rating: number;
    }[];
  }): string {
    const localBusiness: LocalBusiness = {
      '@type': 'LocalBusiness',
      name: business.name,
      description: business.description,
      url: business.url,
      telephone: business.telephone,
      openingHours: business.openingHours,
      priceRange: business.priceRange,
      image: business.images,
    };

    if (business.address) {
      localBusiness.address = {
        '@type': 'PostalAddress',
        ...business.address,
      };
    }

    if (business.coordinates) {
      localBusiness.geo = {
        '@type': 'GeoCoordinates',
        latitude: business.coordinates.latitude,
        longitude: business.coordinates.longitude,
      };
    }

    if (business.rating) {
      localBusiness.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: business.rating.value,
        reviewCount: business.rating.count,
        bestRating: business.rating.best || 5,
        worstRating: business.rating.worst || 1,
      };
    }

    if (business.reviews) {
      localBusiness.review = business.reviews.map(review => ({
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: review.author,
        },
        datePublished: review.date,
        reviewBody: review.body,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: 5,
        },
      }));
    }

    const structuredData = {
      '@context': 'https://schema.org',
      ...localBusiness,
    };

    return JSON.stringify(structuredData, null, 0);
  }

  // Generate structured data for article
  generateArticleLD(article: {
    headline: string;
    description: string;
    author: string;
    datePublished: string;
    dateModified?: string;
    images?: string[];
    url: string;
  }): string {
    const articleData: Article = {
      '@type': 'Article',
      headline: article.headline,
      description: article.description,
      author: {
        '@type': 'Person',
        name: article.author,
      },
      datePublished: article.datePublished,
      dateModified: article.dateModified,
      image: article.images,
      publisher: this.baseConfig.organization,
      mainEntityOfPage: article.url,
    };

    const structuredData = {
      '@context': 'https://schema.org',
      ...articleData,
    };

    return JSON.stringify(structuredData, null, 0);
  }

  // Generate FAQ structured data
  generateFAQLD(faqs: { question: string; answer: string }[]): string {
    const faqData = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(faq => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };

    return JSON.stringify(faqData, null, 0);
  }

  // Generate breadcrumb structured data
  generateBreadcrumbLD(breadcrumbs: { name: string; url: string }[]): string {
    const breadcrumbData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    };

    return JSON.stringify(breadcrumbData, null, 0);
  }

  // Validate and optimize meta description
  optimizeDescription(description: string, maxLength = 155): string {
    if (description.length <= maxLength) return description;
    
    // Find the last complete sentence or phrase within the limit
    const truncated = description.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastPeriod > maxLength - 20) {
      return truncated.substring(0, lastPeriod + 1);
    } else if (lastSpace > maxLength - 10) {
      return truncated.substring(0, lastSpace) + '...';
    } else {
      return truncated + '...';
    }
  }

  // Generate keyword-optimized title
  optimizeTitle(title: string, keywords?: string[], maxLength = 60): string {
    if (title.length <= maxLength) return title;
    
    // If keywords are provided, try to keep them
    if (keywords && keywords.length > 0) {
      const primaryKeyword = keywords[0];
      if (title.toLowerCase().includes(primaryKeyword.toLowerCase())) {
        // Find a way to shorten while keeping the keyword
        const keywordIndex = title.toLowerCase().indexOf(primaryKeyword.toLowerCase());
        const beforeKeyword = title.substring(0, keywordIndex);
        const keyword = title.substring(keywordIndex, keywordIndex + primaryKeyword.length);
        const afterKeyword = title.substring(keywordIndex + primaryKeyword.length);
        
        const availableLength = maxLength - keyword.length;
        const beforeLength = Math.floor(availableLength * 0.4);
        const afterLength = availableLength - beforeLength;
        
        const truncatedBefore = beforeKeyword.length > beforeLength 
          ? '...' + beforeKeyword.substring(beforeKeyword.length - beforeLength + 3)
          : beforeKeyword;
          
        const truncatedAfter = afterKeyword.length > afterLength
          ? afterKeyword.substring(0, afterLength - 3) + '...'
          : afterKeyword;
          
        return truncatedBefore + keyword + truncatedAfter;
      }
    }
    
    // Fallback: simple truncation
    return title.substring(0, maxLength - 3) + '...';
  }
}

// Default SEO configuration
const defaultSEOConfig = {
  siteName: 'QR City Guide',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost:3000',
  defaultTitle: 'QR City Guide - Discover Your City',
  defaultDescription: 'Explore your city with our comprehensive QR code guide. Discover attractions, restaurants, and hidden gems.',
  defaultImage: '/images/og-default.jpg',
  locale: 'en-US',
  themeColor: '#000000',
  organization: {
    '@type': 'Organization' as const,
    name: 'QR City Guide',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost:3000',
    logo: '/images/logo.png',
    sameAs: [
      'https://twitter.com/qrcityguide',
      'https://facebook.com/qrcityguide',
      'https://instagram.com/qrcityguide',
    ],
  },
};

// Create global SEO manager instance
export const seoManager = new SEOManager(defaultSEOConfig);

// Convenience exports
export const generateMetadata = seoManager.generateMetadata.bind(seoManager);
export const generateStructuredData = {
  organization: seoManager.generateOrganizationLD.bind(seoManager),
  website: seoManager.generateWebSiteLD.bind(seoManager),
  webpage: seoManager.generateWebPageLD.bind(seoManager),
  localBusiness: seoManager.generateLocalBusinessLD.bind(seoManager),
  article: seoManager.generateArticleLD.bind(seoManager),
  faq: seoManager.generateFAQLD.bind(seoManager),
  breadcrumb: seoManager.generateBreadcrumbLD.bind(seoManager),
};

// Types export
export type { SEOConfig, Organization, LocalBusiness, Article, BreadcrumbList };