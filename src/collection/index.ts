import { define, tools, eventsApi, EventMap, EventsDefinition, Mixable } from '../object-plus/index'
import { transactionApi, Transactional, CloneOptions, Transaction, TransactionOptions, TransactionalDefinition, Owner } from '../transactions'
import { Record, SharedRecordType, TransactionalType, createSharedTypeSpec } from '../record/index'

import { IdIndex, sortElements, dispose, Elements, CollectionCore, addIndex, removeIndex, Comparator, CollectionTransaction } from './commons/'
import { addTransaction } from './add'
import { setTransaction, emptySetTransaction } from './set'
import { removeOne, removeMany } from './remove'

const { trigger2 } = eventsApi,
    { begin, commit, markAsDirty } = transactionApi,
    { omit, log, assign, defaults } = tools;

let _count = 0;

const silentOptions = { silent : true };

export type GenericComparator = string | ( ( x : Record ) => number ) | ( ( a : Record, b : Record ) => number );


export interface CollectionOptions extends TransactionOptions {
    comparator? : GenericComparator
    model? : typeof Record
}

interface CollectionDefinition extends TransactionalDefinition {
    model? : Record,
    itemEvents? : EventsDefinition
    _itemEvents? : EventMap
}

@define({
    // Default client id prefix
    cidPrefix : 'c',
    model : Record,
    _changeEventName : 'changes',
    _aggregationError : null
})
export class Collection extends Transactional implements CollectionCore {
    _shared : number
    _aggregationError : Record[]

    static Subset : typeof Collection
    static Set : typeof Collection
    static _SubsetOf : typeof Collection

    createSubset( models, options ){
        const SubsetOf = (<any>this.constructor).subsetOf( this ).options.type,
            subset   = new SubsetOf( models, options );

        subset.resolve( this );
        return subset;
    }

    static predefine() : any {
        // Cached subset collection must not be inherited.
        const Ctor = this;
        this._SubsetOf = null;

        function Subset( a, b, listen? ){
            Ctor.call( this, a, b, listen ? 1 : 2 );
        }

        Mixable.mixTo( Subset );

        Subset.prototype = this.prototype;
        Subset._attribute = TransactionalType;
        Subset[ 'of' ] = function( path ){
            return Ctor.subsetOf( path );
        }

        this.Set = this.Subset = <any>Subset;

        Transactional.predefine.call( this );
        createSharedTypeSpec( this, SharedCollectionType );
        return this;
    }

    static define( protoProps : CollectionDefinition = {}, staticProps? ){
                // Extract record definition from static members, if any.
        const   staticsDefinition : CollectionDefinition = tools.getChangedStatics( this, 'model', 'itemEvents' ),
                // Definition can be made either through statics or define argument.
                // Merge them together, so we won't care about it below.
                definition = assign( staticsDefinition, protoProps );

        const spec : CollectionDefinition = omit( definition, 'itemEvents' );

        if( definition.itemEvents ){
            const eventsMap = new EventMap( this.prototype._itemEvents );
            eventsMap.addEventsMap( definition.itemEvents );
            spec._itemEvents = eventsMap;
        }

        return Transactional.define.call( this, spec, staticProps );
    }

    static subsetOf : ( collectionReference : any ) => any;

    _itemEvents : EventMap

    /***********************************
     * Core Members
     */
    // Array of the records
    models : Record[]

    // Polymorphic accessor for aggregated attribute's canBeUpdated().
    get _state(){ return this.models; }

    // Index by id and cid
    _byId : IdIndex

    set comparator( x : GenericComparator ){
        let compare;

        switch( typeof x ){
            case 'string' :
                this._comparator = ( a, b ) => {
                    const aa = a[ <string>x ], bb = b[ <string>x ];
                    if( aa === bb ) return 0;
                    return aa < bb ? -1 : + 1;
                }
                break;
            case 'function' :
                if( x.length === 1 ){
                    this._comparator = ( a, b ) => {
                        const aa = (<any>x).call( this, a ), bb = (<any>x).call( this, b );
                        if( aa === bb ) return 0;
                        return aa < bb ? -1 : + 1;
                    }
                }
                else{
                    this._comparator = ( a, b ) => (<any>x).call( this, a, b );
                }
                break;

            default :
                this._comparator = null;
        }
    }

    // TODO: Improve typing
    getStore() : Transactional {
        return this._store || ( this._store = this._owner ? this._owner.getStore() : this._defaultStore );
    }

    _store : Transactional

    get comparator(){ return this._comparator; }
    _comparator : ( a : Record, b : Record ) => number

    _onChildrenChange( record : Record, options : TransactionOptions = {} ){
        const isRoot = begin( this ),
            { idAttribute } = this;

        if( record.hasChanged( idAttribute ) ){
            const { _byId } = this;
            delete _byId[ record.previous( idAttribute ) ];

            const { id } = record;
            id == null || ( _byId[ id ] = record );
        }

        if( markAsDirty( this, options ) ){
            // Forward change event from the record.
            trigger2( this, 'change', record, options )
        }

        isRoot && commit( this );
    }

    get( objOrId : string | Record | Object ) : Record {
        if( objOrId == null ) return;

        if( typeof objOrId === 'object' ){
            const id = objOrId[ this.idAttribute ];
            return ( id !== void 0 && this._byId[ id ] ) || this._byId[ (<Record>objOrId).cid ];
        }
        else{
            return this._byId[ objOrId ];
        }
    }

    each( iteratee : ( val : Record, key : number ) => void, context? : any ){
        const fun = arguments.length === 2 ? ( v, k ) => iteratee.call( context, v, k ) : iteratee,
            { models } = this;

        for( let i = 0; i < models.length; i++ ){
            fun( models[ i ], i );
        }
    }

    _validateNested( errors : {} ) : number {
        // Don't validate if not aggregated.
        if( this._shared ) return 0;

        let count = 0;

        this.each( record => {
            const error = record.validationError;
            if( error ){
                errors[ record.cid ] = error;
                count++;
            }
        });

        return count;
    }

    model : typeof Record

    // idAttribute extracted from the model type.
    idAttribute : string

    constructor( records? : ( Record | {} )[], options : CollectionOptions = {}, shared? : number ){
        super( _count++ );
        this.models = [];
        this._byId = {};

        this.comparator  = this.comparator;

        if( options.comparator !== void 0 ){
            this.comparator = options.comparator;
            options.comparator = void 0;
        }

        this.model       = this.model;

        if( options.model ){
            this.model = options.model;
            options.model = void 0;
        }

        this.idAttribute = this.model.prototype.idAttribute; //TODO: Remove?

        this._shared = shared || 0;

        if( records ){
            const elements = toElements( this, records, options );
            emptySetTransaction( this, elements, options, true );
        }

        this.initialize.apply( this, arguments );

        if( this._localEvents ) this._localEvents.subscribe( this, this );
    }

    initialize(){}

    get length() : number { return this.models.length; }
    first() : Record { return this.models[ 0 ]; }
    last() : Record { return this.models[ this.models.length - 1 ]; }
    at( a_index : number ) : Record {
        const index = a_index < 0 ? a_index + this.models.length : a_index;
        return this.models[ index ];
    }

    // Deeply clone collection, optionally setting new owner.
    clone( options : CloneOptions = {} ) : this {
        const models = this.map( model => model.clone() ),
              copy : this = new (<any>this.constructor)( models, { model : this.model, comparator : this.comparator }, this._shared );

        if( options.pinStore ) copy._defaultStore = this.getStore();

        return copy;
    }

    toJSON() : Object[] {
        // Don't serialize when not aggregated
        if( !this._shared ){
            return this.models.map( model => model.toJSON() );
        }
    }

    // Apply bulk in-place object update in scope of ad-hoc transaction
    set( elements : ElementsArg = [], options : TransactionOptions = {} ) : this {
        if( (<any>options).add !== void 0 ){
            log.error("Collection.set doesn't support 'add' option, behaving as if options.add === true.");
        }

        // Handle reset option here - no way it will be populated from the top as nested transaction.
        if( options.reset ){
            this.reset( elements, options )
        }
        else{
            const transaction = this._createTransaction( elements, options );
            transaction && transaction.commit();
        }

        return this;
    }

    dispose(){
        if( !this._shared ){
            for( let record of this.models ){
                if( record._owner === this ) record.dispose();
            }
        }

        super.dispose();
    }

    reset( a_elements : ElementsArg, options : TransactionOptions = {} ) : Record[] {
        const isRoot = begin( this ),
              previousModels = dispose( this );

        // Make all changes required, but be silent.
        if( a_elements ){
            emptySetTransaction( this, toElements( this, a_elements, options ), options, true );
        }

        markAsDirty( this, options );

        options.silent || trigger2( this, 'reset', this, defaults( { previousModels : previousModels }, options ) );

        isRoot && commit( this );
        return this.models;
    }

    // Add elements to collection.
    add( a_elements : ElementsArg , options : TransactionOptions = {} ){
        const elements = toElements( this, a_elements, options ),
              transaction = this.models.length ?
                    addTransaction( this, elements, options ) :
                    emptySetTransaction( this, elements, options );

        if( transaction ){
            transaction.commit();
            return transaction.added;
        }
    }

    // Remove elements.
    remove( recordsOrIds : any, options : TransactionOptions = {} ) : Record[] | Record {
        if( recordsOrIds ){
            return Array.isArray( recordsOrIds ) ?
                        removeMany( this, recordsOrIds, options ) :
                        removeOne( this, recordsOrIds, options );
        }

        return [];
    }

    // Apply bulk object update without any notifications, and return open transaction.
    // Used internally to implement two-phase commit.
    _createTransaction( a_elements : ElementsArg, options : TransactionOptions = {} ) : CollectionTransaction {
        const elements = toElements( this, a_elements, options );

        if( this.models.length ){
            return options.remove === false ?
                        addTransaction( this, elements, options, true ) :
                        setTransaction( this, elements, options );
        }
        else{
            return emptySetTransaction( this, elements, options );
        }
    }

    static _attribute = TransactionalType;

    /***********************************
     * Collection manipulation methods
     */

    pluck( key : string ) : any[] {
        return this.models.map( model => model[ key ] );
    }

    sort( options : TransactionOptions = {} ) : this {
        if( sortElements( this, options ) ){
            const isRoot = begin( this );

            if( markAsDirty( this, options ) ){
                trigger2( this, 'sort', this, options );
            }

            isRoot && commit( this );
        }

        return this;
    }

    // Add a model to the end of the collection.
    push(model, options) {
      return this.add(model, assign({at: this.length}, options));
    }

    // Remove a model from the end of the collection.
    pop(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    }

    // Add a model to the beginning of the collection.
    unshift(model, options) {
      return this.add(model, assign({at: 0}, options));
    }

    // Remove a model from the beginning of the collection.
    shift( options? : CollectionOptions ) : Record {
      var model = this.at(0);
      this.remove( model, options );
      return model;
    }

    // Slice out a sub-array of models from the collection.
    slice() : Record[] {
      return slice.apply(this.models, arguments);
    }

    indexOf( modelOrId : any ) : number {
        const record = this.get( modelOrId );
        return this.models.indexOf( record );
    }

    modelId( attrs : {} ) : any {
        return attrs[ this.model.prototype.idAttribute ];
    }

    // Toggle model in collection.
    toggle( model : Record, a_next? : boolean ) : boolean {
        var prev = Boolean( this.get( model ) ),
            next = a_next === void 0 ? !prev : Boolean( a_next );

        if( prev !== next ){
            if( prev ){
                this.remove( model );
            }
            else{
                this.add( model );
            }
        }

        return next;
    }
}

type ElementsArg = Object | Record | Object[] | Record[];

// TODO: make is safe for parse to return null (?)
function toElements( collection : Collection, elements : ElementsArg, options : CollectionOptions ) : Elements {
    const parsed = options.parse ? collection.parse( elements, options ) : elements;
    return Array.isArray( parsed ) ? parsed : [ parsed ];
}

const slice = Array.prototype.slice;

class SharedCollectionType extends SharedRecordType {
    type : typeof Collection
        // Shared object can never be type casted.
    convert( value : any, options : TransactionOptions, prev : any, record : Record ) : Transactional {
        return value == null || value instanceof this.type ? value : new this.type( value, options, 1 );
    }
}


createSharedTypeSpec( Collection, SharedCollectionType );

Record.Collection = <any>Collection;
