import { Collection } from '../collection/index'
import { Record } from '../record/index'
import { CompiledReference } from '../traversable'

export type CollectionReference = ( () => Collection ) | Collection | string;

/** @private */
export function parseReference( collectionRef : CollectionReference ) : ( root : Record ) => Collection {
    switch( typeof collectionRef ){
        case 'function' :
            return root => (<any>collectionRef).call( root );
        case 'object'   :
            return () => <Collection>collectionRef;
        case 'string'   :
            const { resolve } = new CompiledReference( <string>collectionRef );
            return resolve;
    }
}
