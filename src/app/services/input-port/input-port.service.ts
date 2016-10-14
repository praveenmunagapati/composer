import {Injectable, Inject} from "@angular/core";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {Subject} from "rxjs/Subject";
import {Observable} from "rxjs/Observable";
import {CommandInputParameterModel as InputProperty} from "cwlts/models/d2sb";
import {ExpressionModel} from "cwlts";
import {SandboxService, SandboxResponse} from "../sandbox/sandbox.service";

export type InputPropertyViewModel = {
    value: string,
    inputProperty: InputProperty
}

interface PropertyOperation {
    (inputProperty: InputProperty[]): InputProperty[];
}

@Injectable()
export class InputPortService {

    /** The input ports stream we expose */
    public inputPorts: Observable<InputProperty[]>;

    /** Initial content of the input port list */
    private initialInputPorts: InputProperty[] = [];

    /** Stream for adding new imports */
    private newInputPorts: Subject<InputProperty> = new Subject<InputProperty>();

    /** Stream for adding new imports */
    private deletedInputPort: Subject<number> = new Subject<number>();

    /** Stream that aggregates all changes on the exposedList list */
    private inputPortsUpdate: BehaviorSubject<PropertyOperation> = new BehaviorSubject<PropertyOperation>(undefined);

    private sandboxService: SandboxService;

    constructor(@Inject(SandboxService) sandboxService) {

        this.sandboxService = sandboxService;

        /* Subscribe the exposedList to inputPortsUpdate */
        this.inputPorts = this.inputPortsUpdate
            .filter(update => update !== undefined)
            .scan((inputPorts: InputProperty[], operation: PropertyOperation) => {
                return operation(inputPorts);
            }, this.initialInputPorts)
            .publishReplay(1)
            .refCount();

        /* Update the initialInputPorts when the inputPorts stream changes */
        this.inputPorts.subscribe((portList: InputProperty[]) => {
            this.initialInputPorts = portList;
        });

        /* Add new input ports */
        this.newInputPorts
            .map((inputPort: InputProperty): PropertyOperation => {
                return (inputPorts: InputProperty[]) => {
                    return inputPorts.concat(inputPort);
                };
            })
            .subscribe(this.inputPortsUpdate);

        /* Delete input ports */
        this.deletedInputPort
            .map((index: number): PropertyOperation => {
                return (inputPorts: InputProperty[]) => {
                    if (typeof inputPorts[index] !== 'undefined' && inputPorts[index] !== null) {
                        inputPorts.splice(index, 1);
                    }
                    return inputPorts;
                };
            })
            .subscribe(this.inputPortsUpdate);
    }

    public addInput(inputPort: InputProperty): void {
        this.newInputPorts.next(inputPort);
    }

    public deleteInputPort(index: number): void {
        this.deletedInputPort.next(index);
    }

    public setInputs(inputs: Array<InputProperty>): void {
        inputs.forEach(input => {
            this.newInputPorts.next(input);
        })
    }

    public inputPortListToViewModelList(inputProperties: InputProperty[]): Observable<InputPropertyViewModel[]> {
        const result: BehaviorSubject<InputPropertyViewModel[]> = new BehaviorSubject<InputPropertyViewModel[]>(undefined);
        const inputPropertiesStream: Observable<InputProperty> = Observable.from(inputProperties);
        const viewModelList: InputPropertyViewModel[] = [];

        inputPropertiesStream.subscribe((property: InputProperty) => {
            const propInputBinding = property.getValueFrom();

            if ((<ExpressionModel>propInputBinding).script) {
                this.sandboxService.submit((<ExpressionModel>propInputBinding).script)
                    .subscribe((response: SandboxResponse) => {
                        viewModelList.push({
                            value: response.output,
                            inputProperty: property
                        });
                    });

            } else if (typeof propInputBinding === "string") {
                viewModelList.push({
                    value: propInputBinding,
                    inputProperty: property
                });
            }
        }, (err) => {
            console.log('Error: %s', err);
        }, () => {
            result.next(viewModelList);
        });

        return result.filter(res => res !== undefined);
    }

    public viewModelListToInputPortList(viewModelList: InputPropertyViewModel[]) {
        return viewModelList.map((inputPropVm: InputPropertyViewModel) => {
            return inputPropVm.inputProperty;
        });
    }
}
