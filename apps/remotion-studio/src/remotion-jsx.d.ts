import React from "react";

declare global {
  namespace JSX {
    type ElementType = any;
    interface Element extends React.ReactElement<any, any> {}
    interface ElementClass extends React.Component<any> {}
  }
  namespace React {
    namespace JSX {
      type ElementType = any;
      interface Element extends React.ReactElement<any, any> {}
      interface ElementClass extends React.Component<any> {}
    }
  }
}
